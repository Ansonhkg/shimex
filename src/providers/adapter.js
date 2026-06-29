import { handleAnthropicRequest } from "./anthropic/adapter.js";
import { autoRouterNoCandidateResult, resolveAutoRouterCandidate } from "./auto-router/adapter.js";
import { handleChatGptCodexRequest } from "./chatgpt-codex/adapter.js";
import { handleCursorComposerRequest } from "./cursor-composer/adapter.js";
import { handleOpenAiCompatibleRequest } from "./openai-compatible/adapter.js";
import { handleOpenAiResponsesRequest } from "./openai-responses/adapter.js";
import { jsonResult, resolveModelRoute } from "./routes.js";

export async function handleProviderModelRequest(config, pathname, body, options = {}) {
  if ((options.depth || 0) > 4) {
    return jsonResult({
      error: {
        message: "Provider routing exceeded the maximum redirect depth.",
        type: "shimex_route_loop",
      },
    }, 500);
  }
  const requestedModel = String(body.model || "");
  const route = await resolveModelRoute(config, requestedModel);
  if (!route) {
    return jsonResult({
      error: {
        message: `Unknown model slug: ${requestedModel}`,
        type: "shimex_unknown_model",
      },
    }, 404);
  }
  switch (route.provider.requestAdapter) {
    case "route-policy": {
      const candidate = await resolveAutoRouterCandidate(config, route, body, {
        classify: route.providerConfig.options.classifier
          ? (prompt) => classifyAutoRoute(config, route, prompt, options)
          : null,
      });
      if (!candidate) {
        return autoRouterNoCandidateResult(route);
      }
      return await handleProviderModelRequest(config, pathname, { ...body, model: candidate }, {
        ...options,
        depth: (options.depth || 0) + 1,
      });
    }
    case "chatgpt-codex-passthrough":
      return await handleChatGptCodexRequest(route, pathname, body, options);
    case "cursor-agent-bridge":
      return await handleCursorComposerRequest(route, pathname, body, options);
    case "openai-compatible-chat":
      return await handleOpenAiCompatibleRequest(route, pathname, body, options);
    case "openai-compatible-responses":
      return await handleOpenAiResponsesRequest(route, pathname, body, options);
    case "anthropic-messages":
      return await handleAnthropicRequest(route, pathname, body, options);
    default:
      return jsonResult({
        error: {
          message: `${route.provider.id} has no registered request adapter.`,
          type: "shimex_adapter_missing",
        },
      }, 501);
  }
}

async function classifyAutoRoute(config, route, prompt, options) {
  const classifier = String(route.providerConfig.options.classifier || "").trim();
  if (!classifier || classifier === route.model.slug) {
    return "";
  }
  const result = await handleProviderModelRequest(config, "/v1/responses", {
    model: classifier,
    input: prompt,
    stream: false,
    temperature: 0,
    max_output_tokens: Number(route.providerConfig.options.max_tokens || route.providerConfig.options.maxTokens || 600),
  }, {
    ...options,
    depth: (options.depth || 0) + 1,
  });
  if (result.status >= 400) {
    return "";
  }
  const payload = JSON.parse(result.body || "{}");
  return responseText(payload);
}

function responseText(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  const parts = [];
  for (const item of payload.output || []) {
    if (item?.type !== "message") {
      continue;
    }
    for (const part of item.content || []) {
      if (part?.text) {
        parts.push(String(part.text));
      }
    }
  }
  return parts.join("\n");
}
