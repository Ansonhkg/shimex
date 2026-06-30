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

function rewriteChatModel(payload, requestedModel) {
  if (payload && typeof payload === "object" && payload.model) {
    payload.model = requestedModel;
  }
  return payload;
}

