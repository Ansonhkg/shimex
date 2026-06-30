import { anthropicHeaders, authMissingResult, joinEndpoint, upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import { createToolNamespaceMap, responsePayloadToEvents } from "../openai-compatible/translate.js";
import {
  anthropicToChatCompletion,
  anthropicToResponse,
  chatToAnthropic,
  responsesToAnthropic,
} from "./translate.js";

export async function handleAnthropicRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  if (pathname === "/v1/chat/completions") {
    return await postAnthropic(route, chatToAnthropic(body, route.model.upstreamModel, route.model.maxOutputTokens), {
      requestedModel: route.model.slug,
      asResponses: false,
      fetch: options.fetch || fetch,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    return await postAnthropic(route, responsesToAnthropic(body, route.model.upstreamModel, route.model.maxOutputTokens), {
      requestedModel: route.model.slug,
      asResponses: true,
      toolNamespaceMap: createToolNamespaceMap(body.tools),
      fetch: options.fetch || fetch,
    });
  }
  return null;
}

async function postAnthropic(route, body, options) {
  const wantsStream = Boolean(body.stream);
  const upstreamBody = wantsStream ? { ...body, stream: false } : body;
  const headers = anthropicHeaders(route);
  if (!headers) {
    return jsonResult(authMissingResult(route.provider.id), 401);
  }
  const upstream = await options.fetch(joinEndpoint(route.providerConfig.endpoint, "/messages"), {
    method: "POST",
    headers,
    body: JSON.stringify(upstreamBody),
  });
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  const payload = await upstream.json();
  if (wantsStream) {
    return streamResult(async (response) => {
      if (options.asResponses) {
        const responsePayload = anthropicToResponse(payload, options.requestedModel, options.toolNamespaceMap);
        for (const event of responsePayloadToEvents(responsePayload, options.requestedModel)) {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } else {
        response.write(`data: ${JSON.stringify(chatCompletionToChunk(anthropicToChatCompletion(payload, options.requestedModel)))}\n\n`);
      }
      response.write("data: [DONE]\n\n");
    });
  }
  if (options.asResponses) {
    return jsonResult(anthropicToResponse(payload, options.requestedModel, options.toolNamespaceMap));
  }
  return jsonResult(anthropicToChatCompletion(payload, options.requestedModel));
}

function chatCompletionToChunk(payload) {
  const choice = payload.choices?.[0] || {};
  const message = choice.message || {};
  return {
    id: payload.id,
    object: "chat.completion.chunk",
    created: payload.created,
    model: payload.model,
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls,
      },
      finish_reason: choice.finish_reason || "stop",
    }],
  };
}

