import {
  chatChunkToResponsesEvents,
  chatCompletionToResponse,
  createResponsesStreamState,
  createToolNamespaceMap,
  finishChatResponsesStream,
  responsesToChat,
  unwrapOpenAICompatiblePayload,
} from "../openai-compatible/translate.js";
import { clinePassAccessToken, clinePassProfileAccessToken } from "./auth.js";
import { clinePassInputModalities, clinePassProvider, clinePassUpstreamModel, isClinePassModelSlug, loadClineAuthStore } from "./index.js";
import { resolveClineProfileForSlug } from "./authStore.js";

const CLINE_PASS_API_BASE_URL = "https://api.cline.bot/api/v1";

export async function handleClinePassModelRequest(body, options = {}) {
  const route = options.route || null;
  const requestedModel = String(route?.model?.slug || body.model || "");
  if (!route && !isClinePassModelSlug(requestedModel)) {
    return null;
  }
  if (hasImageInput(body) && !clinePassInputModalities(requestedModel).includes("image")) {
    return jsonResult({
      error: {
        message: `${requestedModel} does not support image input.`,
        type: "shimex_unsupported_modality",
      },
    }, 400);
  }
  const upstreamModel = route?.model?.upstreamModel || clinePassUpstreamModel(requestedModel);
  const chatBody = sanitizeClineChatBody(body.messages
    ? { ...body, model: upstreamModel }
    : responsesToChat(body, upstreamModel));
  const toolNamespaceMap = body.messages ? null : createToolNamespaceMap(body.tools);
  const resolved = await resolveClineAuth(route, requestedModel, options);
  if (!resolved.token) {
    return jsonResult({ error: { message: resolved.message || "ClinePass auth unavailable.", type: "shimex_auth_unavailable" } }, 401);
  }
  const token = resolved.token;
  if (chatBody.stream) {
    return streamResult(async (response) => {
      await streamClinePassChat(response, chatBody, requestedModel, token, options.fetch || fetch, toolNamespaceMap);
    });
  }
  const upstream = await postClinePassChat(chatBody, token, options.fetch || fetch);
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  const payload = unwrapOpenAICompatiblePayload(await upstream.json());
  if (body.messages) {
    return jsonResult(payload);
  }
  return jsonResult(chatCompletionToResponse(payload, requestedModel, toolNamespaceMap));
}

async function streamClinePassChat(response, body, requestedModel, token, fetchImpl, toolNamespaceMap) {
  const upstream = await postClinePassChat(body, token, fetchImpl);
  if (!upstream.ok) {
    response.write(`data: ${JSON.stringify(await upstreamError(upstream))}\n\n`);
    response.write("data: [DONE]\n\n");
    return;
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    const payload = unwrapOpenAICompatiblePayload(await upstream.json());
    const responsePayload = chatCompletionToResponse(payload, requestedModel, toolNamespaceMap);
    response.write(`data: ${JSON.stringify({ type: "response.created", response: { ...responsePayload, status: "in_progress", output: [] } })}\n\n`);
    response.write(`data: ${JSON.stringify({ type: "response.completed", response: responsePayload })}\n\n`);
    response.write("data: [DONE]\n\n");
    return;
  }
  const state = createResponsesStreamState({ toolNamespaceMap });
  for await (const payload of readSseJson(upstream)) {
    const chunk = unwrapOpenAICompatiblePayload(payload);
    const error = streamPayloadError(chunk);
    if (error) {
      writeResponsesStreamFailure(response, state, requestedModel, error);
      return;
    }
    for (const event of chatChunkToResponsesEvents(state, chunk, requestedModel, toolNamespaceMap)) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
  for (const event of finishChatResponsesStream(state, requestedModel)) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.write("data: [DONE]\n\n");
}

function streamPayloadError(payload) {
  if (!payload || typeof payload !== "object" || (!payload.error && payload.success !== false)) {
    return "";
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  const providerAttempts = payload.providerMetadata?.gateway?.routing?.modelAttempts
    ?.flatMap((attempt) => attempt?.providerAttempts || [])
    .map((attempt) => attempt?.error)
    .filter(Boolean);
  return String(
    providerAttempts?.[0]
      || payload.error?.param?.error
      || payload.error?.message
      || payload.message
      || "ClinePass upstream stream failed.",
  );
}

function writeResponsesStreamFailure(response, state, requestedModel, message) {
  if (!state.created) {
    state.created = true;
    response.write(`data: ${JSON.stringify({
      type: "response.created",
      response: {
        id: state.responseId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "in_progress",
        model: requestedModel,
        output: [],
      },
    })}\n\n`);
  }
  response.write(`data: ${JSON.stringify({
    type: "response.failed",
    response: {
      id: state.responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "failed",
      model: requestedModel,
      output: [],
      error: { code: "upstream_error", message },
    },
  })}\n\n`);
  response.write("data: [DONE]\n\n");
}

async function postClinePassChat(body, token, fetchImpl) {
  return await fetchImpl(`${CLINE_PASS_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: body.stream ? "text/event-stream" : "application/json",
      "user-agent": "shimex",
    },
    body: JSON.stringify(body),
  });
}

function sanitizeClineChatBody(body) {
  if (!Array.isArray(body.tools)) {
    return body;
  }
  return {
    ...body,
    tools: body.tools.map((tool) => ({
      ...tool,
      function: tool?.function
        ? { ...tool.function, parameters: sanitizeJsonSchema(tool.function.parameters) }
        : tool?.function,
    })),
  };
}

function sanitizeJsonSchema(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchema);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, sanitizeJsonSchema(nested)]),
  );
  const types = Array.isArray(result.type) ? result.type : [result.type].filter(Boolean);
  if (types.length && Array.isArray(result.enum)) {
    const valid = result.enum.filter((candidate) => types.some((type) => jsonValueMatchesType(candidate, type)));
    if (valid.length) {
      result.enum = valid;
    } else {
      delete result.enum;
    }
  }
  if (types.length && Object.hasOwn(result, "const") && !types.some((type) => jsonValueMatchesType(result.const, type))) {
    delete result.const;
  }
  return result;
}

function jsonValueMatchesType(value, type) {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    default: return true;
  }
}

async function* readSseJson(response) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        yield JSON.parse(data);
      }
    }
  }
}

async function upstreamError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText, type: "upstream_error" } };
  }
}

function jsonResult(body, status = 200) {
  return {
    status,
    body: JSON.stringify(body, null, 2),
    headers: { "content-type": "application/json; charset=utf-8" },
  };
}

function streamResult(stream) {
  return {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
    stream,
  };
}

export function clinePassCanHandle(model) {
  return clinePassProvider.id && isClinePassModelSlug(model);
}

function hasImageInput(value) {
  if (Array.isArray(value)) {
    return value.some(hasImageInput);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (["input_image", "image_url"].includes(value.type)) {
    return true;
  }
  if (value.image_url || value.image_base64) {
    return true;
  }
  return hasImageInput(value.input) || hasImageInput(value.messages) || hasImageInput(value.content);
}


async function resolveClineAuth(route, requestedModel, options) {
  if (route) {
    const store = await loadClineAuthStore(route.providerConfig, options.rootConfig || route.rootConfig);
    if (route.model.profile && store.profiles[route.model.profile]) {
      return { token: await clinePassProfileAccessToken(store.profiles[route.model.profile], route.providerConfig, options.rootConfig || route.rootConfig, options) };
    }
    const resolved = resolveClineProfileForSlug(store, requestedModel);
    if (resolved?.profile?.accessToken) {
      return { token: await clinePassProfileAccessToken(resolved.profile, route.providerConfig, options.rootConfig || route.rootConfig, options) };
    }
  }
  const token = await clinePassAccessToken(options);
  return token ? { token } : { token: "", message: route?.model?.profile ? `Cline profile "${route.model.profile}" is unavailable.` : "ClinePass auth unavailable." };
}
