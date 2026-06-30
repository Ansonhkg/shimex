import { chatCompletionToResponse, chatToResponsesRequest } from "../openai-compatible/translate.js";

export function responsesToAnthropic(body, upstreamModel, maxOutputTokens = null) {
  return chatToAnthropic(chatLikeFromResponses(body, upstreamModel), upstreamModel, maxOutputTokens);
}

export function chatToAnthropic(body, upstreamModel, maxOutputTokens = null) {
  const system = [];
  const messages = [];
  for (const message of body.messages || []) {
    const role = normalizeRole(message.role);
    if (role === "system") {
      const text = contentToText(message.content);
      if (text) {
        system.push(text);
      }
      continue;
    }
    if (role === "tool") {
      appendMessage(messages, "user", [{
        type: "tool_result",
        tool_use_id: message.tool_call_id || "call_0",
        content: contentToText(message.content),
      }]);
      continue;
    }
    if (role === "assistant") {
      const content = message.content ? chatContentToAnthropicBlocks(message.content) : [];
      for (const call of message.tool_calls || []) {
        const fn = call.function || {};
        content.push({
          type: "tool_use",
          id: call.id || "call_0",
          name: fn.name || "",
          input: parseJsonObject(fn.arguments),
        });
      }
      if (content.length) {
        appendMessage(messages, "assistant", content);
      }
      continue;
    }
    appendMessage(messages, "user", chatContentToAnthropicContent(message.content));
  }
  const request = {
    model: upstreamModel,
    messages: messages.length ? messages : [{ role: "user", content: "" }],
    max_tokens: Number(body.max_tokens || body.max_output_tokens || maxOutputTokens || 4096),
    stream: Boolean(body.stream),
  };
  if (system.length) {
    request.system = system.join("\n\n");
  }
  copyIfPresent(body, request, "temperature");
  copyIfPresent(body, request, "top_p");
  const tools = chatToolsToAnthropicTools(body.tools);
  if (tools.length) {
    request.tools = tools;
  }
  return request;
}

export function anthropicToChatCompletion(payload, requestedModel) {
  let content = "";
  const toolCalls = [];
  for (const block of payload.content || []) {
    if (block?.type === "text") {
      content += block.text || "";
    }
    if (block?.type === "tool_use") {
      toolCalls.push({
        id: block.id || "call_0",
        type: "function",
        function: {
          name: block.name || "",
          arguments: JSON.stringify(block.input || {}),
        },
      });
    }
  }
  const message = { role: "assistant", content };
  if (toolCalls.length) {
    message.tool_calls = toolCalls;
  }
  return {
    id: payload.id || `chatcmpl_anthropic_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{
      index: 0,
      message,
      finish_reason: payload.stop_reason === "tool_use" ? "tool_calls" : "stop",
    }],
    usage: chatUsage(payload.usage),
  };
}

export function anthropicToResponse(payload, requestedModel) {
  const response = chatCompletionToResponse(anthropicToChatCompletion(payload, requestedModel), requestedModel);
  response.usage = normalizeResponsesUsage(payload.usage);
  return response;
}

function chatLikeFromResponses(body, upstreamModel) {
  const request = chatToResponsesRequest({
    messages: Array.isArray(body.input) ? body.input : [{ role: "user", content: body.input || "" }],
    stream: body.stream,
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_output_tokens || body.max_tokens,
    tools: body.tools,
  }, upstreamModel);
  return {
    model: upstreamModel,
    messages: responseInputToChatMessages(body),
    stream: request.stream,
    temperature: request.temperature,
    top_p: request.top_p,
    max_tokens: request.max_output_tokens,
    tools: request.tools,
  };
}

function responseInputToChatMessages(body) {
  const messages = [];
  if (body.instructions) {
    messages.push({ role: "system", content: body.instructions });
  }
  const input = body.input;
  if (typeof input === "string" || !Array.isArray(input)) {
    messages.push({ role: "user", content: input || "" });
    return messages;
  }
  const pendingToolCalls = [];
  const flushPendingToolCalls = () => {
    if (!pendingToolCalls.length) {
      return;
    }
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: pendingToolCalls.splice(0),
    });
  };
  for (const item of input) {
    if (typeof item === "string") {
      flushPendingToolCalls();
      messages.push({ role: "user", content: item });
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.type === "function_call") {
      pendingToolCalls.push({
        id: item.call_id || item.id || "call_0",
        type: "function",
        function: {
          name: item.name || "",
          arguments: item.arguments || "",
        },
      });
      continue;
    }
    if (item.type === "function_call_output") {
      flushPendingToolCalls();
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || "call_0",
        content: contentToText(item.output || item.content || ""),
      });
      continue;
    }
    flushPendingToolCalls();
    messages.push({
      role: normalizeRole(item.role || "user"),
      content: item.content || item,
    });
  }
  flushPendingToolCalls();
  return messages;
}

function chatContentToAnthropicContent(content) {
  const blocks = chatContentToAnthropicBlocks(content);
  if (!blocks.some((block) => block.type === "image")) {
    return blocks.map((block) => block.text || "").join("\n");
  }
  return blocks;
}

function chatContentToAnthropicBlocks(content) {
  const blocks = [];
  for (const part of chatParts(content)) {
    if (part.type === "text" && part.text) {
      blocks.push({ type: "text", text: part.text });
    }
    if (part.type === "image_url") {
      const image = imageBlock(part);
      if (image) {
        blocks.push(image);
      }
    }
  }
  return blocks.length ? blocks : [{ type: "text", text: "" }];
}

function chatParts(content) {
  if (content == null) {
    return [];
  }
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (Array.isArray(content)) {
    return content.flatMap(chatParts);
  }
  if (typeof content === "object") {
    if (["input_text", "output_text", "text"].includes(content.type)) {
      return content.text ? [{ type: "text", text: String(content.text) }] : [];
    }
    if (["input_image", "image_url"].includes(content.type) || content.image_url) {
      return [{ type: "image_url", image_url: imageUrl(content) }];
    }
    if (content.content) {
      return chatParts(content.content);
    }
    if (content.text) {
      return [{ type: "text", text: String(content.text) }];
    }
  }
  return [];
}

function imageBlock(part) {
  const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
  if (!url) {
    return null;
  }
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+);base64,(.*)$/s);
    if (!match) {
      return null;
    }
    return {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

function imageUrl(part) {
  if (typeof part.image_url === "string") {
    return part.image_url;
  }
  if (part.image_url?.url) {
    return part.image_url.url;
  }
  if (part.url) {
    return part.url;
  }
  if (part.image_base64) {
    return `data:${part.mime_type || "image/png"};base64,${part.image_base64}`;
  }
  return "";
}

function chatToolsToAnthropicTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools.map((tool) => {
    const fn = tool.function || tool;
    return {
      name: fn.name || tool.name || "",
      description: fn.description || tool.description || "",
      input_schema: fn.parameters || tool.parameters || { type: "object", properties: {} },
    };
  }).filter((tool) => tool.name);
}

function appendMessage(messages, role, content) {
  const previous = messages.at(-1);
  if (previous?.role === role && Array.isArray(previous.content) && Array.isArray(content)) {
    previous.content.push(...content);
  } else {
    messages.push({ role, content });
  }
}

function normalizeRole(role) {
  if (role === "developer") {
    return "system";
  }
  if (["system", "assistant", "tool", "user"].includes(role)) {
    return role;
  }
  return "user";
}

function contentToText(content) {
  if (content == null) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(contentToText).filter(Boolean).join("\n");
  }
  if (typeof content === "object") {
    if (["input_image", "image_url"].includes(content.type) || content.image_url) {
      return "[image]";
    }
    return String(content.text || content.content || content.output || "");
  }
  return String(content);
}

function parseJsonObject(value) {
  if (!value || typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { _raw: value };
  }
}

function normalizeResponsesUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: usage.total_tokens ?? input + output,
  };
}

function chatUsage(usage) {
  const normalized = normalizeResponsesUsage(usage);
  if (!normalized) {
    return undefined;
  }
  return {
    prompt_tokens: normalized.input_tokens,
    completion_tokens: normalized.output_tokens,
    total_tokens: normalized.total_tokens,
  };
}

function copyIfPresent(source, target, key) {
  if (source[key] !== undefined) {
    target[key] = source[key];
  }
}
