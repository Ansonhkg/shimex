import { joinEndpoint, readSseJson, upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatChunkToResponsesEvents,
  chatCompletionToResponse,
  createResponsesStreamState,
  createToolNamespaceMap,
  finishChatResponsesStream,
  responsePayloadToEvents,
  responsesToChat,
  unwrapOpenAICompatiblePayload,
} from "../openai-compatible/translate.js";import { resolveGrokAuth } from "./auth.js";
import { DEFAULT_GROK_ENDPOINT, resolveGrokClientVersion } from "./index.js";

export async function handleGrokRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  const auth = await resolveGrokAuth({
    authPath: route.providerConfig.options?.auth_path || route.providerConfig.options?.authPath || options.authPath,
    fetch: options.fetch || fetch,
  });
  if (!auth?.accessToken) {
    return jsonResult({
      error: {
        message: "Grok session auth is not available. Run `grok login` and keep ~/.grok/auth.json readable.",
        type: "shimex_auth_unavailable",
      },
    }, 401);
  }
  const endpoint = String(route.providerConfig.endpoint || DEFAULT_GROK_ENDPOINT).replace(/\/+$/, "");
  const clientVersion = await resolveGrokClientVersion(route.providerConfig, options);
  if (pathname === "/v1/chat/completions") {
    return await postChat(route, endpoint, auth, clientVersion, { ...body, model: route.model.upstreamModel }, {
      asResponses: false,
      requestedModel: route.model.slug,
      fetch: options.fetch || fetch,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    const chatBody = responsesToChat(body, route.model.upstreamModel);
    return await postChat(route, endpoint, auth, clientVersion, chatBody, {
      asResponses: true,
      requestedModel: route.model.slug,
      toolNamespaceMap: createToolNamespaceMap(body.tools),
      fetch: options.fetch || fetch,
    });
  }
  return null;
}

async function postChat(route, endpoint, auth, clientVersion, body, options) {
  const wantsStream = Boolean(body.stream);
  const upstream = await options.fetch(joinEndpoint(endpoint, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
      accept: wantsStream ? "text/event-stream" : "application/json",
      "user-agent": `xai-grok-build/${clientVersion}`,
      "x-grok-client-version": clientVersion,
      "x-grok-client-surface": "grok-build",
    },
    body: JSON.stringify(body),
  });
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  if (wantsStream) {
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

function rewriteChatModel(payload, requestedModel) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  return { ...payload, model: requestedModel };
}
