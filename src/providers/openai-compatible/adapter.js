import { authMissingResult, joinEndpoint, openAiHeaders, readSseJson, upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatChunkToResponsesEvents,
  chatCompletionToResponse,
  createResponsesStreamState,
  createToolNamespaceMap,
  finishChatResponsesStream,
  responsePayloadToEvents,
  responsesToChat,
  rewriteResponseModel,
  unwrapOpenAICompatiblePayload,
} from "./translate.js";

export async function handleOpenAiCompatibleRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  if (pathname === "/v1/chat/completions") {
    return await postChat(route, { ...body, model: route.model.upstreamModel }, {
      asResponses: false,
      requestedModel: route.model.slug,
      fetch: options.fetch || fetch,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    const chatBody = responsesToChat(body, route.model.upstreamModel);
    return await postChat(route, providerChatBody(route, chatBody), {
      asResponses: true,
      requestedModel: route.model.slug,
      toolNamespaceMap: createToolNamespaceMap(body.tools),
      fetch: options.fetch || fetch,
    });
  }
  return null;
}

async function postChat(route, body, options) {
  const headers = openAiHeaders(route, body.stream ? "text/event-stream" : "application/json");
  if (!headers) {
    return jsonResult(authMissingResult(route.provider.id), 401);
  }
  const upstream = await options.fetch(joinEndpoint(route.providerConfig.endpoint, "/chat/completions"), {
    method: "POST",
    headers,
    body: JSON.stringify(providerChatBody(route, body)),
  });
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  if (body.stream) {
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("text/event-stream")) {
      return streamResult(async (response) => {
        if (options.asResponses) {
          await streamChatAsResponses(response, upstream, options.requestedModel, options.toolNamespaceMap);
        } else {
          await streamChatPassThrough(response, upstream, options.requestedModel);
        }
      });
    }
    const payload = unwrapOpenAICompatiblePayload(await upstream.json());
    return streamResult(async (response) => {
      if (options.asResponses) {
        for (const event of responsePayloadToEvents(chatCompletionToResponse(payload, options.requestedModel, options.toolNamespaceMap), options.requestedModel)) {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } else {
        response.write(`data: ${JSON.stringify(rewriteChatModel(payload, options.requestedModel))}\n\n`);
      }
      response.write("data: [DONE]\n\n");
    });
  }
  const payload = unwrapOpenAICompatiblePayload(await upstream.json());
  if (options.asResponses) {
    return jsonResult(chatCompletionToResponse(payload, options.requestedModel, options.toolNamespaceMap));
  }
  return jsonResult(rewriteChatModel(payload, options.requestedModel));
}

async function streamChatAsResponses(response, upstream, requestedModel, toolNamespaceMap) {
  const state = createResponsesStreamState({ toolNamespaceMap });
  for await (const payload of readSseJson(upstream)) {
    const chunk = unwrapOpenAICompatiblePayload(payload);
    for (const event of chatChunkToResponsesEvents(state, chunk, requestedModel, toolNamespaceMap)) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
  for (const event of finishChatResponsesStream(state, requestedModel)) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.write("data: [DONE]\n\n");
}

async function streamChatPassThrough(response, upstream, requestedModel) {
  for await (const payload of readSseJson(upstream)) {
    response.write(`data: ${JSON.stringify(rewriteChatModel(unwrapOpenAICompatiblePayload(payload), requestedModel))}\n\n`);
  }
  response.write("data: [DONE]\n\n");
}

function providerChatBody(route, body) {
  const merged = { ...body };
  if (route.provider.id === "lm-studio" && Array.isArray(merged.messages)) {
    merged.messages = normalizeLmStudioMessages(merged.messages, merged.tools);
  }
  const extra = route.providerConfig.options.extra_body || route.providerConfig.options.extraBody;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [key, value] of Object.entries(extra)) {
      if (value && typeof value === "object" && !Array.isArray(value) && merged[key] && typeof merged[key] === "object") {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }
  }
  if (route.provider.id === "cloudflare-workers-ai" && merged.max_tokens && !merged.max_completion_tokens) {
    merged.max_completion_tokens = merged.max_tokens;
    delete merged.max_tokens;
  }
  return merged;
}

function normalizeLmStudioMessages(messages, tools) {
  const normalized = [];
  for (const message of messages) {
    if (message?.role !== "tool" || !Array.isArray(message.content)) {
      normalized.push(message);
      continue;
    }
    const text = message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n") || "Tool returned an image.";
    const images = message.content
      .filter((part) => part?.type === "image_url" && part.image_url)
      .map((part) => ({
        ...part,
        image_url: typeof part.image_url === "string" ? { url: part.image_url } : part.image_url,
      }));
    normalized.push({ ...message, content: text });
    if (images.length) {
      normalized.push({
        role: "user",
        content: [
          { type: "text", text: "Image returned by the preceding tool call." },
          ...images,
        ],
      });
    }
  }

  const systemInstructions = [];
  const conversation = [];
  for (const message of normalized) {
    if (message?.role === "system") {
      const text = lmStudioSystemText(message.content);
      if (text) {
        systemInstructions.push(text);
      }
      continue;
    }
    conversation.push(message);
  }

  if (!systemInstructions.length) {
    return conversation;
  }
  const leadingSystem = {
    role: "system",
    content: systemInstructions.join("\n\n"),
  };
  const browserGuidance = lmStudioBrowserGuidance(leadingSystem.content, tools);
  if (browserGuidance) {
    leadingSystem.content += `\n\n${browserGuidance}`;
  }
  return [
    leadingSystem,
    ...conversation,
  ];
}

function lmStudioBrowserGuidance(systemContent, tools) {
  if (systemContent.includes("LM Studio Browser tool discipline:")) {
    return "";
  }
  const toolNames = new Set(Array.isArray(tools)
    ? tools.map((tool) => tool?.function?.name).filter(Boolean)
    : []);
  if (!toolNames.has("exec_command") || !toolNames.has("js")) {
    return "";
  }
  const skillLine = systemContent
    .split("\n")
    .find((line) => line.includes("browser:control-in-app-browser:") && line.includes("(file:"));
  const skillPath = skillLine?.match(/\(file:\s*([^)]+\/SKILL\.md)\)/)?.[1]?.trim();
  if (!skillPath) {
    return "";
  }
  const outputDirectory = systemContent.match(/Use\s+`?(\/[^\s`]+\/outputs)`?\s+only/)?.[1];
  const guidance = [
    "LM Studio Browser tool discipline:",
    `Before any Browser action, first call exec_command to read the complete Browser skill at ${skillPath}, then follow it using the provided js tool.`,
    "Browser is a skill, not an MCP server. Never call list_mcp_resources for Browser, invent shell commands such as open_url/open_in_browser, or use standalone Playwright.",
    "For a screenshot, use exactly one browser tab: create it once with browser.tabs.new() without arguments, wrap await tab.goto(url) in try/catch, then capture from that same tab with await tab.screenshot({ fullPage: false }). A goto timeout can occur after the page is already visible, so log it and continue to the screenshot; do not let it abort the capture block.",
    "tab.goto() already waits for navigation; do not add a load-state wait before a basic screenshot. If a later interaction genuinely needs one, the supported signature is await tab.playwright.waitForLoadState({ state: \"domcontentloaded\", timeoutMs: 10000 }). Reuse the same tab after any timeout. Never open replacement tabs in a retry loop or fall back to shell Playwright.",
    "Never pass a URL to tabs.new(), call waitForNavigation(), pass a file path to screenshot(), or redeclare a persistent const/let binding. screenshot() returns image bytes; return them with await nodeRepl.emitImage(imageBytes).",
  ];
  if (outputDirectory) {
    guidance.push(
      `For a user-facing screenshot, capture and save in the same js call: use var bindings, await import(\"node:fs/promises\"), await mkdir(${JSON.stringify(outputDirectory)}, { recursive: true }), capture the bytes, await writeFile() under ${outputDirectory}, then await nodeRepl.emitImage(imageBytes). Verify the PNG exists with exec_command and embed its absolute path in the final response as ![Screenshot](absolute-path).`,
      "Never use a top-level static import in js. The supported form is exactly: var fs = await import(\"node:fs/promises\");. Await every filesystem and image operation, including await nodeRepl.emitImage(imageBytes). Use reusable var bindings for the tab, screenshot bytes, and path so retries do not fail with duplicate declarations.",
    );
  }
  guidance.push("Do not merely promise a Browser action; continue with the required tool calls until the requested action is complete.");
  return guidance.join("\n");
}

function lmStudioSystemText(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function rewriteChatModel(payload, requestedModel) {
  if (payload && typeof payload === "object" && payload.model) {
    payload.model = requestedModel;
  }
  return payload;
}
