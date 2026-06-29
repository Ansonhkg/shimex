import { spawn } from "node:child_process";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatChunkToResponsesEvents,
  createResponsesStreamState,
  finishChatResponsesStream,
  responsesToChat,
} from "../openai-compatible/translate.js";

export async function handleCursorComposerRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  if (pathname === "/v1/chat/completions") {
    return await runCursor(route, promptFromChat(body), {
      requestedModel: route.model.slug,
      stream: Boolean(body.stream),
      asResponses: false,
      runCursorAgent: options.runCursorAgent,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    return await runCursor(route, buildCursorPrompt(body), {
      requestedModel: route.model.slug,
      stream: Boolean(body.stream) && pathname !== "/v1/responses/compact",
      asResponses: true,
      runCursorAgent: options.runCursorAgent,
    });
  }
  return null;
}

async function runCursor(route, prompt, options) {
  const events = options.runCursorAgent
    ? options.runCursorAgent(prompt, route.model.upstreamModel)
    : runCursorAgent(prompt, route.model.upstreamModel);
  if (options.stream) {
    return streamResult(async (response) => {
      if (options.asResponses) {
        await streamCursorAsResponses(response, events, options.requestedModel);
      } else {
        await streamCursorAsChat(response, events, options.requestedModel);
      }
    });
  }
  let text = "";
  let usage = null;
  try {
    for await (const event of events) {
      if (event.type === "text_delta") {
        text += String(event.delta || "");
      }
      if (event.type === "completed" && event.text) {
        text = String(event.text);
      }
      if (event.type === "usage") {
        usage = event.usage;
      }
      if (event.type === "error") {
        return jsonResult({ error: { message: String(event.message || "cursor-agent failed"), type: "cursor_agent_error" } }, 502);
      }
    }
  } catch (error) {
    return jsonResult({ error: { message: cursorErrorMessage(String(error?.message || error), 1), type: "cursor_agent_error" } }, 502);
  }
  if (options.asResponses) {
    return jsonResult(cursorResponse(text, usage, options.requestedModel));
  }
  return jsonResult(cursorChatCompletion(text, usage, options.requestedModel));
}

async function streamCursorAsResponses(response, events, requestedModel) {
  const state = createResponsesStreamState();
  for await (const event of events) {
    if (event.type === "text_delta") {
      for (const payload of chatChunkToResponsesEvents(state, {
        choices: [{ delta: { content: String(event.delta || "") } }],
      }, requestedModel)) {
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }
    if (event.type === "usage") {
      state.usage = normalizeResponsesUsage(event.usage);
    }
    if (event.type === "error") {
      response.write(`data: ${JSON.stringify({ error: { message: event.message, type: "cursor_agent_error" } })}\n\n`);
      break;
    }
  }
  for (const payload of finishChatResponsesStream(state, requestedModel)) {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  response.write("data: [DONE]\n\n");
}

async function streamCursorAsChat(response, events, requestedModel) {
  for await (const event of events) {
    if (event.type === "text_delta") {
      response.write(`data: ${JSON.stringify({
        object: "chat.completion.chunk",
        model: requestedModel,
        choices: [{ index: 0, delta: { content: String(event.delta || "") }, finish_reason: null }],
      })}\n\n`);
    }
    if (event.type === "error") {
      response.write(`data: ${JSON.stringify({ error: { message: event.message, type: "cursor_agent_error" } })}\n\n`);
      break;
    }
  }
  response.write("data: [DONE]\n\n");
}

export function buildCursorPrompt(body) {
  const chat = body.messages ? body : responsesToChat(body, body.model);
  return promptFromChat(chat);
}

function promptFromChat(body) {
  const sections = [];
  for (const message of body.messages || []) {
    const role = String(message.role || "user").toUpperCase();
    const content = messageContent(message);
    if (!content) {
      continue;
    }
    sections.push(`[${role}]\n${content}`);
  }
  return sections.join("\n\n").trim() || "Continue.";
}

function messageContent(message) {
  const content = message.content;
  if (typeof content === "string") {
    return stripThink(content);
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
    } else if (part?.type === "text" || part?.type === "input_text" || part?.type === "output_text") {
      parts.push(String(part.text || ""));
    }
  }
  return stripThink(parts.filter(Boolean).join("\n"));
}

async function* runCursorAgent(prompt, model) {
  const proc = spawn(cursorAgentBin(), [
    "--print",
    "--output-format",
    "stream-json",
    "--stream-partial-output",
    "--force",
    "--trust",
    "--workspace",
    process.env.SHIMEX_CURSOR_WORKSPACE || process.cwd(),
    "--model",
    model,
  ], {
    env: cursorEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let spawnError = null;
  proc.once("error", (error) => {
    spawnError = error;
  });
  proc.stdin.end(prompt);
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  let buffer = "";
  const parser = createCursorParser();
  for await (const chunk of proc.stdout) {
    buffer += String(chunk);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const event = parser.feed(line);
      if (event) {
        yield event;
      }
    }
  }
  if (spawnError) {
    yield { type: "error", message: cursorErrorMessage(String(spawnError.message || spawnError), 1) };
    return;
  }
  if (buffer.trim()) {
    const event = parser.feed(buffer);
    if (event) {
      yield event;
    }
  }
  const code = await new Promise((resolve) => proc.on("close", resolve));
  if (parser.usage) {
    yield { type: "usage", usage: parser.usage };
  }
  if (parser.finalText) {
    yield { type: "completed", text: parser.finalText };
  } else if (code !== 0) {
    yield { type: "error", message: cursorErrorMessage(stderr, code) };
  }
}

function createCursorParser() {
  return {
    textSoFar: "",
    finalText: "",
    usage: null,
    feed(line) {
      if (!line.trim()) {
        return null;
      }
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        return null;
      }
      if (item.type === "assistant" && item.message) {
        const text = extractCursorAssistantText(item.message);
        if (!text) {
          return null;
        }
        const delta = text.startsWith(this.textSoFar) ? text.slice(this.textSoFar.length) : text;
        this.textSoFar = text;
        this.finalText = text;
        return delta ? { type: "text_delta", delta } : null;
      }
      if (item.type === "result") {
        if (typeof item.result === "string" && item.result) {
          this.finalText = item.result;
        }
        if (item.usage) {
          this.usage = {
            input_tokens: item.usage.inputTokens,
            output_tokens: item.usage.outputTokens,
            cache_read_input_tokens: item.usage.cacheReadTokens,
            cache_creation_input_tokens: item.usage.cacheWriteTokens,
          };
        }
      }
      if (item.type === "error") {
        return { type: "error", message: item.message || item.error || "cursor-agent error" };
      }
      return null;
    },
  };
}

function extractCursorAssistantText(message) {
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .filter((block) => block?.type === "text" && block.text)
    .map((block) => String(block.text))
    .join("");
}

function cursorResponse(text, usage, model) {
  return {
    id: `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    status: "completed",
    output: [{
      id: "msg_0",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    }],
    usage: normalizeResponsesUsage(usage),
  };
}

function cursorChatCompletion(text, usage, model) {
  const normalized = normalizeResponsesUsage(usage);
  return {
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: normalized ? {
      prompt_tokens: normalized.input_tokens,
      completion_tokens: normalized.output_tokens,
      total_tokens: normalized.total_tokens,
    } : undefined,
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

function cursorAgentBin() {
  return process.env.CURSOR_AGENT_BIN || "cursor-agent";
}

function cursorEnv() {
  const env = { ...process.env };
  delete env.CURSOR_API_KEY;
  if (process.env.CURSOR_AGENT_BIN) {
    env.PATH = `${process.env.CURSOR_AGENT_BIN.split("/").slice(0, -1).join("/")}:${env.PATH || ""}`;
  }
  return env;
}

function cursorErrorMessage(stderr, code) {
  const message = stderr.trim() || `cursor-agent exited with code ${code}`;
  return isCursorAuthFailure(message)
    ? "Cursor Agent is not authenticated. Run `cursor-agent login`, then `cursor-agent status`, and retry."
    : message;
}

function isCursorAuthFailure(message) {
  const lowered = message.toLowerCase();
  return ["authentication required", "not authenticated", "not logged in", "agent login", "cursor_api_key"].some((marker) => lowered.includes(marker));
}

function stripThink(text) {
  return String(text || "").replace(/<think>.*?<\/think>/gis, "");
}
