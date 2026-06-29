import { authMissingResult, joinEndpoint, openAiHeaders, readSseJson, upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatToResponsesRequest,
  responsePayloadToEvents,
  responseToChatCompletion,
  rewriteResponseModel,
} from "../openai-compatible/translate.js";

export async function handleOpenAiResponsesRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  if (pathname === "/v1/chat/completions") {
    const request = chatToResponsesRequest(body, route.model.upstreamModel);
    return await postResponses(route, request, {
      requestedModel: route.model.slug,
      asChat: true,
      fetch: options.fetch || fetch,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    return await postResponses(route, { ...body, model: route.model.upstreamModel }, {
      requestedModel: route.model.slug,
      asChat: false,
      fetch: options.fetch || fetch,
    });
  }
  return null;
}

async function postResponses(route, body, options) {
  const wantsStream = Boolean(body.stream);
  const upstreamBody = wantsStream ? { ...body, stream: false } : body;
  const headers = openAiHeaders(route, wantsStream ? "text/event-stream" : "application/json");
  if (!headers) {
    return jsonResult(authMissingResult(route.provider.id), 401);
  }
  const upstream = await options.fetch(joinEndpoint(route.providerConfig.endpoint, "/responses"), {
    method: "POST",
    headers,
    body: JSON.stringify(upstreamBody),
  });
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (wantsStream) {
    if (contentType.toLowerCase().includes("text/event-stream")) {
      return streamResult(async (response) => {
        for await (const payload of readSseJson(upstream)) {
          const rewritten = rewriteResponseModel(payload, options.requestedModel);
          response.write(`data: ${JSON.stringify(rewritten)}\n\n`);
        }
        response.write("data: [DONE]\n\n");
      });
    }
    const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
    return streamResult(async (response) => {
      if (options.asChat) {
        response.write(`data: ${JSON.stringify(responseToChatCompletion(payload, options.requestedModel))}\n\n`);
      } else {
        for (const event of responsePayloadToEvents(payload, options.requestedModel)) {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }
      response.write("data: [DONE]\n\n");
    });
  }
  const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
  if (options.asChat) {
    return jsonResult(responseToChatCompletion(payload, options.requestedModel));
  }
  return jsonResult(payload);
}

