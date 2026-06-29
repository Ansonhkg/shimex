import { readCodexAuth } from "./auth.js";
import { upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatToResponsesRequest,
  responsePayloadToEvents,
  responseToChatCompletion,
  rewriteResponseModel,
} from "../openai-compatible/translate.js";

const CHATGPT_CODEX_BASE = "https://chatgpt.com/backend-api/codex";

export async function handleChatGptCodexRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  if (pathname === "/v1/chat/completions") {
    const request = chatToResponsesRequest(body, route.model.upstreamModel);
    return await postChatGpt(route, "/responses", request, {
      asChat: true,
      requestedModel: route.model.slug,
      headers: options.headers,
      fetch: options.fetch || fetch,
      authPath: options.authPath,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    const suffix = pathname === "/v1/responses/compact" ? "/responses/compact" : "/responses";
    return await postChatGpt(route, suffix, { ...body, model: route.model.upstreamModel }, {
      asChat: false,
      requestedModel: route.model.slug,
      headers: options.headers,
      fetch: options.fetch || fetch,
      authPath: options.authPath,
    });
  }
  return null;
}

async function postChatGpt(route, suffix, body, options) {
  const auth = await readCodexAuth({ authPath: options.authPath });
  if (!auth) {
    return jsonResult({
      error: {
        message: "Codex auth is not available. Run Codex login in the original app or CLI, then retry.",
        type: "shimex_auth_unavailable",
      },
    }, 401);
  }
  const upstreamBody = suffix.endsWith("/compact") ? { ...body, stream: false } : body;
  const upstream = await options.fetch(`${CHATGPT_CODEX_BASE}${suffix}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
      accept: upstreamBody.stream ? "text/event-stream" : "application/json",
      "openai-beta": "responses=2026-02-06",
      originator: "codex_cli_rs",
      "chatgpt-account-id": auth.accountId,
      session_id: options.headers?.get?.("session_id") || options.headers?.session_id || "",
      "user-agent": "shimex",
    },
    body: JSON.stringify(upstreamBody),
  });
  if (!upstream.ok) {
    return jsonResult(await upstreamError(upstream), upstream.status);
  }
  const wantsStream = Boolean(body.stream) && !suffix.endsWith("/compact");
  if (wantsStream) {
    return streamResult(async (response) => {
      const contentType = upstream.headers.get("content-type") || "";
      if (contentType.toLowerCase().includes("text/event-stream")) {
        await passThroughResponseEvents(response, upstream, options.requestedModel);
      } else {
        const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
        await writeSyntheticStream(response, payload, options);
      }
    });
  }
  const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
  if (options.asChat) {
    return jsonResult(responseToChatCompletion(payload, options.requestedModel));
  }
  return jsonResult(payload);
}

async function passThroughResponseEvents(response, upstream, requestedModel) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of upstream.body) {
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
        try {
          response.write(`data: ${JSON.stringify(rewriteResponseModel(JSON.parse(data), requestedModel))}\n\n`);
        } catch {
          response.write(`data: ${data}\n\n`);
        }
      }
    }
  }
  response.write("data: [DONE]\n\n");
}

async function writeSyntheticStream(response, payload, options) {
  if (options.asChat) {
    response.write(`data: ${JSON.stringify(responseToChatCompletion(payload, options.requestedModel))}\n\n`);
  } else {
    for (const event of responsePayloadToEvents(payload, options.requestedModel)) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
  response.write("data: [DONE]\n\n");
}
