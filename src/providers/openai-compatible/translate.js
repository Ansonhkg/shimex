export function responsesToChat(body, upstreamModel) {
  const toolsForProviders = ensureCodexAppThreadTools(body.tools);
  const messages = [];
  if (body.instructions) {
    messages.push({ role: "system", content: contentToText(body.instructions) });
  }
  const toolHint = codexAppToolHint(toolsForProviders);
  if (toolHint) {
    messages.push({ role: "system", content: toolHint });
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
  const tools = responsesToolsToChatTools(toolsForProviders);
  if (tools.length) {
    chat.tools = tools;
  }
  return chat;
}
export function chatToResponsesRequest(body, upstreamModel) {
  const instructions = [];
  const input = [];

  for (const msg of (Array.isArray(body.messages) ? body.messages : [])) {
    if (!msg || typeof msg !== "object") {
      continue;
    }
    if (msg.role === "system" || msg.role === "developer") {
      const text = contentToText(msg.content);
      if (text) instructions.push(text);
      continue;
    }
    if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id || "",
        output: contentToText(msg.content),
      });
      continue;
    }
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      for (const call of msg.tool_calls) {
        input.push({
          type: "function_call",
          call_id: call.id || "",
          name: call.function?.name || call.name || "",
          arguments: call.function?.arguments || call.arguments || "",
        });
      }
      continue;
    }
    input.push({
      type: "message",
      role: normalizeRole(msg.role || "user"),
      content: chatContentToResponsesContent(msg.content),
    });
  }

  const request = {
    model: upstreamModel,
    input,
    stream: Boolean(body.stream),
    // Chat completions are stateless; ChatGPT/Codex Responses requires this
    // explicit opt-out when bridging /v1/chat/completions to /responses.
    store: false,
  };
  if (instructions.length) {
    request.instructions = instructions.join("\n");
  }
  copyIfPresent(body, request, "temperature");
  copyIfPresent(body, request, "top_p");
  copyIfPresent(body, request, "max_tokens", "max_output_tokens");
  copyIfPresent(body, request, "max_output_tokens");
  copyIfPresent(body, request, "parallel_tool_calls");
  copyIfPresent(body, request, "reasoning_effort");
  if (body.tools) {
    request.tools = body.tools;
  }
  if (body.tool_choice) {
    request.tool_choice = body.tool_choice;
  }
  return request;
}
export function chatCompletionToResponse(payload, requestedModel, toolNamespaceMap = null) {
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
      ...namespaceFields(toolNamespaceMap, fn.name || ""),
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

export function responseToChatCompletion(payload, requestedModel) {
  const message = {
    role: "assistant",
    content: "",
  };
  const toolCalls = [];
  for (const item of payload.output || []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.type === "message") {
      message.content += contentToText(item.content || "");
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id || "call_0",
        type: "function",
        function: {
          name: item.name || "",
          arguments: item.arguments || "",
        },
      });
    }
  }
  if (toolCalls.length) {
    message.tool_calls = toolCalls;
  }
  return {
    id: payload.id || `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: payload.created_at || Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length ? "tool_calls" : "stop",
    }],
    usage: chatUsage(payload.usage),
  };
}

export function chatChunkToResponsesEvents(state, chunk, requestedModel, toolNamespaceMap = null) {
  if (toolNamespaceMap && !state.toolNamespaceMap) {
    state.toolNamespaceMap = normalizeToolNamespaceMap(toolNamespaceMap);
  }
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
      events.push(...openStreamMessage(state));
    }
    state.text += text;
    events.push({
      type: "response.output_text.delta",
      item_id: state.messageId,
      output_index: state.messageIndex,
      content_index: 0,
      delta: text,
    });
  }
  for (const call of delta.tool_calls || []) {
    if (state.messageOpened && !state.messageClosed) {
      events.push(...closeStreamMessage(state));
    }
    events.push(...streamToolCallDelta(state, call));
  }
  return events;
}

export function responsePayloadToEvents(payload, requestedModel) {
  const response = rewriteResponseModel(payload, requestedModel);
  const responseId = response.id || `resp_${Date.now()}`;
  const events = [{
    type: "response.created",
    response: {
      ...response,
      id: responseId,
      status: "in_progress",
      output: [],
    },
  }];
  const output = Array.isArray(response.output) ? response.output : [];
  output.forEach((item, outputIndex) => {
    if (!item || typeof item !== "object") {
      return;
    }
    if (item.type !== "message") {
      events.push({
        type: "response.output_item.added",
        output_index: outputIndex,
        item: { ...item, status: "in_progress" },
      });
      events.push({
        type: "response.output_item.done",
        output_index: outputIndex,
        item,
      });
      return;
    }
    const itemId = item.id || `msg_${outputIndex}`;
    events.push({
      type: "response.output_item.added",
      output_index: outputIndex,
      item: { ...item, id: itemId, status: "in_progress", content: [] },
    });
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part, contentIndex) => {
      if (!part || typeof part !== "object") {
        return;
      }
      if (!["output_text", "text"].includes(part.type)) {
        return;
      }
      const text = String(part.text || "");
      const opened = { type: "output_text", text: "", annotations: part.annotations || [] };
      const done = { ...opened, text };
      events.push({
        type: "response.content_part.added",
        item_id: itemId,
        output_index: outputIndex,
        content_index: contentIndex,
        part: opened,
      });
      if (text) {
        events.push({
          type: "response.output_text.delta",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          delta: text,
        });
      }
      events.push({
        type: "response.output_text.done",
        item_id: itemId,
        output_index: outputIndex,
        content_index: contentIndex,
        text,
      });
      events.push({
        type: "response.content_part.done",
        item_id: itemId,
        output_index: outputIndex,
        content_index: contentIndex,
        part: done,
      });
    });
    events.push({
      type: "response.output_item.done",
      output_index: outputIndex,
      item: { ...item, id: itemId, status: item.status || "completed" },
    });
  });
  events.push({
    type: "response.completed",
    response: { ...response, id: responseId, model: requestedModel, status: "completed" },
  });
  return events;
}

export function rewriteResponseModel(payload, requestedModel) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  if (payload.response && typeof payload.response === "object") {
    payload.response.model = requestedModel;
  }
  if (payload.model) {
    payload.model = requestedModel;
  }
  return payload;
}

export function finishChatResponsesStream(state, requestedModel) {
  const events = [];
  if (state.messageOpened && !state.messageClosed) {
    events.push(...closeStreamMessage(state));
  }
  for (const toolCall of orderedToolCalls(state)) {
    if (!toolCall.closed) {
      events.push(...closeStreamToolCall(toolCall));
    }
  }
  events.push({
    type: "response.completed",
    response: {
      id: state.responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: requestedModel,
      output: completedStreamOutput(state),
      usage: state.usage,
    },
  });
  return events;
}

export function createResponsesStreamState(options = {}) {
  const now = Date.now();
  return {
    responseId: `resp_${now}`,
    messageId: `msg_${now}`,
    created: false,
    nextOutputIndex: 0,
    messageIndex: null,
    messageOpened: false,
    messageClosed: false,
    text: "",
    toolCalls: new Map(),
    usage: null,
    toolNamespaceMap: normalizeToolNamespaceMap(options.toolNamespaceMap),
  };
}

export function unwrapOpenAICompatiblePayload(payload) {
  if (payload && typeof payload === "object" && payload.data && Array.isArray(payload.data.choices)) {
    return payload.data;
  }
  return payload;
}

function openStreamMessage(state) {
  state.messageIndex = state.nextOutputIndex;
  state.nextOutputIndex += 1;
  state.messageOpened = true;
  return [
    {
      type: "response.output_item.added",
      output_index: state.messageIndex,
      item: {
        id: state.messageId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    },
    {
      type: "response.content_part.added",
      item_id: state.messageId,
      output_index: state.messageIndex,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    },
  ];
}

function closeStreamMessage(state) {
  state.messageClosed = true;
  return [
    {
      type: "response.output_text.done",
      item_id: state.messageId,
      output_index: state.messageIndex,
      content_index: 0,
      text: state.text,
    },
    {
      type: "response.content_part.done",
      item_id: state.messageId,
      output_index: state.messageIndex,
      content_index: 0,
      part: { type: "output_text", text: state.text, annotations: [] },
    },
    {
      type: "response.output_item.done",
      output_index: state.messageIndex,
      item: messageOutput(state.text, state.messageId),
    },
  ];
}

function streamToolCallDelta(state, call) {
  const events = [];
  const index = Number.isInteger(call?.index) ? call.index : Number.parseInt(call?.index ?? "0", 10) || 0;
  const fn = call?.function || {};
  let toolCall = state.toolCalls.get(index);
  if (!toolCall) {
    const callId = call?.id || `call_${index}`;
    toolCall = {
      id: callId,
      callId,
      name: String(fn.name || ""),
      arguments: "",
      outputIndex: state.nextOutputIndex,
      closed: false,
      namespaceMap: state.toolNamespaceMap,
    };
    state.nextOutputIndex += 1;
    state.toolCalls.set(index, toolCall);
    events.push({
      type: "response.output_item.added",
      output_index: toolCall.outputIndex,
      item: {
        id: toolCall.id,
        type: "function_call",
        status: "in_progress",
        call_id: toolCall.callId,
        name: toolCall.name,
        arguments: "",
        ...namespaceFields(state.toolNamespaceMap, toolCall.name),
      },
    });
  } else if (fn.name) {
    toolCall.name += String(fn.name);
  }

  const argumentDelta = fn.arguments || "";
  if (argumentDelta) {
    toolCall.arguments += argumentDelta;
    events.push({
      type: "response.function_call_arguments.delta",
      item_id: toolCall.id,
      output_index: toolCall.outputIndex,
      delta: argumentDelta,
    });
  }
  return events;
}

function closeStreamToolCall(toolCall) {
  toolCall.closed = true;
  return [
    {
      type: "response.function_call_arguments.done",
      item_id: toolCall.id,
      output_index: toolCall.outputIndex,
      arguments: toolCall.arguments,
    },
    {
      type: "response.output_item.done",
      output_index: toolCall.outputIndex,
      item: streamToolCallOutput(toolCall),
    },
  ];
}

function completedStreamOutput(state) {
  const items = [];
  if (state.messageOpened && state.text) {
    items.push({ outputIndex: state.messageIndex, item: messageOutput(state.text, state.messageId) });
  }
  for (const toolCall of orderedToolCalls(state)) {
    items.push({ outputIndex: toolCall.outputIndex, item: streamToolCallOutput(toolCall) });
  }
  return items.sort((a, b) => a.outputIndex - b.outputIndex).map((entry) => entry.item);
}

function orderedToolCalls(state) {
  return Array.from(state.toolCalls.values()).sort((a, b) => a.outputIndex - b.outputIndex);
}

function streamToolCallOutput(toolCall) {
  return {
    id: toolCall.id,
    type: "function_call",
    status: "completed",
    call_id: toolCall.callId,
    name: toolCall.name,
    arguments: toolCall.arguments,
    ...namespaceFields(toolCall.namespaceMap, toolCall.name),
  };
}

function chatContentToResponsesContent(content) {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [{ type: "input_text", text: contentToText(content || "") }];
  }
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: "input_text", text: part });
      continue;
    }
    if (!part || typeof part !== "object") {
      continue;
    }
    if (part.type === "text" || part.type === "input_text") {
      parts.push({ type: "input_text", text: String(part.text || "") });
      continue;
    }
    if (part.type === "image_url" || part.type === "input_image") {
      parts.push({
        type: "input_image",
        image_url: typeof part.image_url === "string" ? part.image_url : part.image_url?.url || part.url || "",
      });
      continue;
    }
    const text = contentToText(part);
    if (text) {
      parts.push({ type: "input_text", text });
    }
  }
  return parts.length ? parts : [{ type: "input_text", text: "" }];
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
    const role = normalizeRole(item.role || (item.type === "message" ? "user" : "user"));
    const content = responsesContentToChatContent(item.content || item);
    if (content !== "" && !(Array.isArray(content) && content.length === 0)) {
      messages.push({ role, content });
    }
  }
  flushPendingToolCalls();
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

export function createToolNamespaceMap(tools) {
  const map = new Map();
  tools = ensureCodexAppThreadTools(tools);
  if (!Array.isArray(tools)) {
    return map;
  }
  for (const tool of tools) {
    if (tool?.type !== "namespace" || !tool.name || !Array.isArray(tool.tools)) {
      continue;
    }
    for (const nestedTool of tool.tools) {
      const name = nestedTool?.name || nestedTool?.function?.name;
      if (name && !map.has(name)) {
        map.set(name, tool.name);
      }
    }
  }
  return map;
}

function normalizeToolNamespaceMap(value) {
  if (value instanceof Map) {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return new Map(Object.entries(value));
  }
  return null;
}

function namespaceFields(toolNamespaceMap, name) {
  const normalized = normalizeToolNamespaceMap(toolNamespaceMap);
  const namespace = normalized?.get(name);
  return namespace ? { namespace } : {};
}

export function ensureCodexAppThreadTools(tools) {
  if (!Array.isArray(tools)) {
    return tools;
  }
  const hasCodexNamespace = tools.some((tool) => tool?.type === "namespace" && tool.name === "codex_app");
  const hasThreadSend = tools.some((tool) => {
    if (tool?.type === "namespace" && tool.name === "codex_app" && Array.isArray(tool.tools)) {
      return tool.tools.some((nested) => nested?.name === "send_message_to_thread");
    }
    return (tool?.name || tool?.function?.name) === "send_message_to_thread";
  });
  if (hasCodexNamespace || hasThreadSend || !hasLoadedCodexAppTool(tools)) {
    return tools;
  }
  const existingNames = new Set(tools.flatMap(toolNames));
  const missingThreadTools = codexAppThreadNamespaceTool().tools
    .filter((tool) => !existingNames.has(tool.name));
  if (!missingThreadTools.length) {
    return tools;
  }
  return [...tools, { ...codexAppThreadNamespaceTool(), tools: missingThreadTools }];
}

function toolNames(tool) {
  if (tool?.type === "namespace" && Array.isArray(tool.tools)) {
    return tool.tools.flatMap(toolNames);
  }
  const name = tool?.name || tool?.function?.name;
  return name ? [name] : [];
}

function hasLoadedCodexAppTool(tools) {
  const loadedCodexAppTools = new Set([
    "navigate_to_codex_page",
    "read_thread_terminal",
    "load_workspace_dependencies",
  ]);
  return tools.some((tool) => loadedCodexAppTools.has(tool?.name || tool?.function?.name));
}

function codexAppThreadNamespaceTool() {
  return {
    type: "namespace",
    name: "codex_app",
    tools: [
      functionTool("list_threads", "List recent Codex threads across the local host and connected remote hosts. Use an optional query to find a specific thread before reading or steering it.", {
        query: { type: "string", description: "Optional thread search query." },
        limit: { type: "number", description: "Maximum number of thread summaries to return." },
      }, []),
      functionTool("read_thread", "Read recent status and turn summaries for one Codex thread without opening it.", {
        threadId: { type: "string", description: "Thread id to inspect." },
        hostId: { type: "string", description: "Optional host id returned by list_threads." },
        turnLimit: { type: "number", description: "Maximum number of turns to return." },
      }, ["threadId"]),
      functionTool("send_message_to_thread", "Send a follow-up prompt to an existing Codex thread in the background. Omit model and thinking to keep the thread's current settings.", {
        threadId: { type: "string", description: "Thread id to continue." },
        hostId: { type: "string", description: "Optional host id returned by list_threads." },
        prompt: { type: "string", description: "Follow-up prompt to send." },
        model: { type: "string", description: "Optional model override." },
        thinking: { type: "string", description: "Optional reasoning effort override." },
      }, ["threadId", "prompt"]),
      functionTool("create_thread", "Create a separate Codex thread only when the user explicitly asks for a new or background thread.", {
        prompt: { type: "string", description: "Initial prompt for the new thread." },
      }, ["prompt"]),
      functionTool("fork_thread", "Fork a Codex thread. Omit threadId to fork the calling thread, or pass a threadId to fork that specific thread.", {
        threadId: { type: "string", description: "Optional source thread id to fork." },
      }, []),
      functionTool("handoff_thread", "Move another Codex thread and its associated git state between its checkout and Codex worktree on its current host.", {
        threadId: { type: "string", description: "Other thread id to hand off." },
        followUpPrompt: { type: "string", description: "Optional prompt to send after handoff succeeds." },
      }, ["threadId"]),
    ],
  };
}

function functionTool(name, description, properties, required) {
  return {
    type: "function",
    name,
    description,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties,
      required,
    },
  };
}

function codexAppToolHint(tools) {
  const codexApp = Array.isArray(tools)
    ? tools.find((tool) => tool?.type === "namespace" && tool.name === "codex_app" && Array.isArray(tool.tools))
    : null;
  if (!codexApp) {
    return "";
  }
  const names = new Set(codexApp.tools.flatMap((tool) => tool?.name ? [tool.name] : []));
  const threadTools = [
    "list_threads",
    "read_thread",
    "send_message_to_thread",
    "navigate_to_codex_page",
    "create_thread",
    "fork_thread",
    "handoff_thread",
  ].filter((name) => names.has(name));
  if (!threadTools.length) {
    return "";
  }
  return [
    "Shimex exposes Codex app tools as callable functions in this request.",
    "Available Codex app thread tools: " + threadTools.join(", ") + ".",
    "These are not MCP resources; do not call list_mcp_resources to check whether Codex app thread tools exist.",
    "For thread:// links or @thread requests, call send_message_to_thread with the target threadId and prompt when that tool is available.",
  ].join(" ");
}

function responsesToolsToChatTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools
    .flatMap((tool) => {
      if (tool?.type === "namespace" && Array.isArray(tool.tools)) {
        return tool.tools;
      }
      return [tool];
    })
    .filter((tool) => tool?.type === "function" || tool?.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name || tool.function?.name || "",
        description: tool.description || tool.function?.description || "",
        parameters: chatToolParameters(tool),
      },
    }))
    .filter((tool) => tool.function.name);
}

function chatToolParameters(tool) {
  const name = tool?.name || tool?.function?.name || "";
  const schema = tool?.parameters || tool?.inputSchema || tool?.function?.parameters;
  if (name === "apply_patch" && !objectProperties(schema?.properties).patch) {
    return applyPatchParametersSchema();
  }
  return objectParametersSchema(schema);
}

function applyPatchParametersSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      patch: {
        type: "string",
        description: "Complete apply_patch payload, starting with *** Begin Patch and ending with *** End Patch.",
      },
    },
    required: ["patch"],
  };
}

function objectParametersSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {} };
  }
  if (Array.isArray(schema.type)) {
    if (schema.type.includes("object")) {
      return { ...schema, type: "object", properties: objectProperties(schema.properties) };
    }
    return scalarParametersSchema(schema);
  }
  if (!schema.type) {
    return { ...schema, type: "object", properties: objectProperties(schema.properties) };
  }
  if (schema.type === "object") {
    return { ...schema, properties: objectProperties(schema.properties) };
  }
  return scalarParametersSchema(schema);
}

function scalarParametersSchema(schema) {
  return {
    type: "object",
    properties: {
      value: { ...schema },
    },
    required: ["value"],
  };
}

function objectProperties(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeAdjacentMessages(messages) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (
      previous
      && previous.role === message.role
      && message.role !== "tool"
      && !previous.tool_calls
      && !message.tool_calls
      && typeof previous.content === "string"
      && typeof message.content === "string"
    ) {
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

function chatUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completion = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage.total_tokens ?? prompt + completion,
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
