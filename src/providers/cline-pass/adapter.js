import {
  chatChunkToResponsesEvents,
  chatCompletionToResponse,
  createResponsesStreamState,
  createToolNamespaceMap,
  finishChatResponsesStream,
  responsesToChat,
  unwrapOpenAICompatiblePayload,
} from "../openai-compatible/translate.js";
import { clinePassAccessToken } from "./auth.js";
import { clinePassInputModalities, clinePassProvider, clinePassUpstreamModel, isClinePassModelSlug } from "./index.js";

const CLINE_PASS_API_BASE_URL = "https://api.cline.bot/api/v1";

export async function handleClinePassModelRequest(body, options = {}) {
  const requestedModel = String(body.model || "");
  if (!isClinePassModelSlug(requestedModel)) {
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
  const upstreamModel = clinePassUpstreamModel(requestedModel);
  const chatBody = body.messages
    ? { ...body, model: upstreamModel }
    : responsesToChat(body, upstreamModel);
  const toolNamespaceMap = body.messages ? null : createToolNamespaceMap(body.tools);
  const token = await clinePassAccessToken(options);
  if (!token) {
    return jsonResult({ error: { message: "ClinePass auth unavailable.", type: "shimex_auth_unavailable" } }, 401);
  }
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
    for (const event of chatChunkToResponsesEvents(state, chunk, requestedModel, toolNamespaceMap)) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
  for (const event of finishChatResponsesStream(state, requestedModel)) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
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
