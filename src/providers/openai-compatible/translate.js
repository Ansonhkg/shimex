export function responsesToChat(body, upstreamModel) {
  const messages = [];
  if (body.instructions) {
    messages.push({ role: "system", content: contentToText(body.instructions) });
  }
  messages.push(...responsesInputToMessages(body.input));
  const chat = {
    model: upstreamModel,
    messages: messages.length ? mergeAdjacentMessages(messages) : [{ role: "user", content: "" }],
    stream: Boolean(body.stream),
  };
  copyIfPresent(body, chat, "temperature");
  copyIfPresent(body, chat, "top_p");
  copyIfPresent(body, chat, "max_output_tokens", "max_tokens");
  copyIfPresent(body, chat, "max_tokens");
  copyIfPresent(body, chat, "parallel_tool_calls");
  copyIfPresent(body, chat, "reasoning_effort");
  const tools = responsesToolsToChatTools(body.tools);
  if (tools.length) {
    chat.tools = tools;
  }
  return chat;
}

export function chatCompletionToResponse(payload, requestedModel) {
  const choice = payload.choices?.[0] || {};
  const message = choice.message || {};
  const output = [];
  const content = contentToText(message.content || "");
  if (message.reasoning_content || message.reasoning) {
    output.push({
      id: "reasoning_0",
      type: "reasoning",
      status: "completed",
      summary: [{ type: "summary_text", text: String(message.reasoning_content || message.reasoning) }],
    });
  }
  if (content) {
    output.push(messageOutput(content));
  }
  for (const call of message.tool_calls || []) {
    const fn = call.function || {};
    output.push({
      id: call.id || "call_0",
      type: "function_call",
      status: "completed",
      call_id: call.id || "call_0",
      name: fn.name || "",
      arguments: fn.arguments || "",
    });
  }
  return {
    id: payload.id || `resp_${Date.now()}`,
    object: "response",
    created_at: payload.created || Math.floor(Date.now() / 1000),
    model: requestedModel,
    status: "completed",
    output,
    usage: normalizeResponsesUsage(payload.usage),
  };
}

export function chatChunkToResponsesEvents(state, chunk, requestedModel) {
  const events = [];
  if (!state.created) {
    state.created = true;
    events.push({
      type: "response.created",
      response: {
        id: state.responseId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "in_progress",
        model: requestedModel,
        output: [],
      },
    });
  }
  if (chunk.usage) {
    state.usage = normalizeResponsesUsage(chunk.usage);
  }
  const delta = chunk.choices?.[0]?.delta || {};
  const text = delta.content || "";
  if (text) {
    if (!state.messageOpened) {
      state.messageOpened = true;
      events.push({
        type: "response.output_item.added",
        output_index: 0,
        item: {
          id: state.messageId,
          type: "message",
          status: "in_progress",
          role: "assistant",
          content: [],
        },
      });
      events.push({
        type: "response.content_part.added",
        item_id: state.messageId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      });
    }
    state.text += text;
    events.push({
      type: "response.output_text.delta",
      item_id: state.messageId,
      output_index: 0,
      content_index: 0,
      delta: text,
    });
  }
  return events;
}

export function finishChatResponsesStream(state, requestedModel) {
  const output = state.text ? [messageOutput(state.text, state.messageId)] : [];
  const events = [];
  if (state.messageOpened) {
    events.push({
      type: "response.output_text.done",
      item_id: state.messageId,
      output_index: 0,
      content_index: 0,
      text: state.text,
    });
    events.push({
      type: "response.content_part.done",
      item_id: state.messageId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: state.text, annotations: [] },
    });
    events.push({
      type: "response.output_item.done",
      output_index: 0,
      item: messageOutput(state.text, state.messageId),
    });
  }
  events.push({
    type: "response.completed",
    response: {
      id: state.responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: requestedModel,
      output,
      usage: state.usage,
    },
  });
  return events;
}

export function createResponsesStreamState() {
  const now = Date.now();
  return {
    responseId: `resp_${now}`,
    messageId: `msg_${now}`,
    created: false,
    messageOpened: false,
    text: "",
    usage: null,
  };
}

export function unwrapOpenAICompatiblePayload(payload) {
  if (payload && typeof payload === "object" && payload.data && Array.isArray(payload.data.choices)) {
    return payload.data;
  }
  return payload;
}

function responsesInputToMessages(input) {
  if (!input) {
    return [];
  }
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  if (!Array.isArray(input)) {
    return [{ role: "user", content: contentToText(input) }];
  }
  const messages = [];
  for (const item of input) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item });
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{
          id: item.call_id || item.id || "call_0",
          type: "function",
          function: { name: item.name || "", arguments: item.arguments || "" },
        }],
      });
      continue;
    }
    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || "call_0",
        content: contentToText(item.output || item.content || ""),
      });
      continue;
    }
    const role = normalizeRole(item.role || (item.type === "message" ? "user" : "user"));
    const content = responsesContentToChatContent(item.content || item);
    if (content !== "" && !(Array.isArray(content) && content.length === 0)) {
      messages.push({ role, content });
    }
  }
  return messages;
}

function responsesContentToChatContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    if (content?.type === "input_text" || content?.type === "text") {
      return String(content.text || "");
    }
    if (content?.type === "input_image" || content?.type === "image_url") {
      return [imagePart(content)];
    }
    return contentToText(content);
  }
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: "text", text: part });
    } else if (part?.type === "input_text" || part?.type === "text") {
      parts.push({ type: "text", text: String(part.text || "") });
    } else if (part?.type === "input_image" || part?.type === "image_url") {
      parts.push(imagePart(part));
    } else if (part?.text) {
      parts.push({ type: "text", text: String(part.text) });
    }
  }
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }
  return parts;
}

function imagePart(part) {
  const url = part.image_url?.url || part.image_url || part.url || dataUrl(part);
  return { type: "image_url", image_url: { url } };
}

function dataUrl(part) {
  if (!part.image_base64) {
    return "";
  }
  return `data:${part.mime_type || "image/png"};base64,${part.image_base64}`;
}

function responsesToolsToChatTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools
    .filter((tool) => tool?.type === "function" || tool?.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name || tool.function?.name || "",
        description: tool.description || tool.function?.description || "",
        parameters: tool.parameters || tool.function?.parameters || {},
      },
    }))
    .filter((tool) => tool.function.name);
}

function mergeAdjacentMessages(messages) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role && typeof previous.content === "string" && typeof message.content === "string") {
      previous.content = `${previous.content}\n${message.content}`.trim();
    } else {
      merged.push({ ...message });
    }
  }
  return merged;
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

function messageOutput(text, id = "msg_0") {
  return {
    id,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [] }],
  };
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
    return String(content.text || content.content || content.output || "");
  }
  return String(content);
}

function copyIfPresent(source, target, from, to = from) {
  if (source[from] !== undefined) {
    target[to] = source[from];
  }
}
