import { readCodexAuth } from "./auth.js";
import { upstreamError } from "../http.js";
import { jsonResult, streamResult, validateModelInput } from "../routes.js";
import {
  chatToResponsesRequest,
  responsePayloadToEvents,
  responseToChatCompletion,
  rewriteResponseModel,
} from "../openai-compatible/translate.js";
import { loadAuthStore } from "./index.js";
import { resolveProfileForSlug, authStorePath } from "./authStore.js";

const CHATGPT_CODEX_BASE = "https://chatgpt.com/backend-api/codex";

export async function handleChatGptCodexRequest(route, pathname, body, options = {}) {
  const unsupported = validateModelInput(route, body);
  if (unsupported) {
    return unsupported;
  }
  const rootConfig = options.rootConfig || route.rootConfig || null;
  const resolved = await resolveAuthForRoute(route, rootConfig, options);
  if (!resolved.ok) {
    return resolved.result;
  }
  if (pathname === "/v1/chat/completions") {
    const request = chatToResponsesRequest(body, route.model.upstreamModel);
    return await postChatGpt(route, "/responses", request, {
      asChat: true,
      requestedModel: route.model.slug,
      profile: resolved.profile,
      headers: options.headers,
      fetch: options.fetch || fetch,
    });
  }
  if (pathname === "/v1/responses" || pathname === "/v1/responses/compact") {
    const suffix = pathname === "/v1/responses/compact" ? "/responses/compact" : "/responses";
    return await postChatGpt(route, suffix, { ...body, model: route.model.upstreamModel }, {
      asChat: false,
      requestedModel: route.model.slug,
      profile: resolved.profile,
      headers: options.headers,
      fetch: options.fetch || fetch,
    });
  }
  return null;
}

async function postChatGpt(route, suffix, body, options) {
  const upstreamBody = suffix.endsWith("/compact") ? { ...body, stream: false } : body;
  const upstream = await options.fetch(`${CHATGPT_CODEX_BASE}${suffix}`, {
    method: "POST",
    headers: {
      ...buildUpstreamHeaders(options.profile, upstreamBody.stream),
      session_id: readSessionId(options.headers),
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
      if (contentType.toLowerCase().includes("json")) {
        const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
        await writeSyntheticStream(response, payload, options);
      } else {
        await passThroughResponseEvents(response, upstream, options.requestedModel);
      }
    });
  }
  const payload = rewriteResponseModel(await upstream.json(), options.requestedModel);
  if (options.asChat) {
    return jsonResult(responseToChatCompletion(payload, options.requestedModel));
  }
  return jsonResult(payload);
}

function buildUpstreamHeaders(profile, stream) {
  return {
    authorization: `Bearer ${profile.accessToken}`,
    "content-type": "application/json",
    accept: stream ? "text/event-stream" : "application/json",
    "openai-beta": "responses=2026-02-06",
    originator: "codex_cli_rs",
    "chatgpt-account-id": profile.accountId || "",
    "user-agent": "shimex",
  };
}

async function resolveAuthForRoute(route, rootConfig, options) {
  const providerConfig = route.providerConfig;
  const store = shouldUseOnlyLegacyAuth(providerConfig, options)
    ? { profiles: {}, defaultProfile: "" }
    : await loadAuthStore(providerConfig, rootConfig);
  if (route.model.profile && store.profiles[route.model.profile]) {
    const profile = store.profiles[route.model.profile];
    if (profile.accessToken) {
      return { ok: true, profile };
    }
  }
  const resolved = resolveProfileForSlug(store, route.model.slug);
  if (resolved && resolved.profile.accessToken) {
    return { ok: true, profile: resolved.profile };
  }
  const legacyPath = providerConfig.options?.auth_path || providerConfig.options?.authPath;
  const legacy = await readCodexAuth({ authPath: legacyPath || options.authPath });
  if (legacy && legacy.accessToken) {
    return {
      ok: true,
      profile: {
        name: "legacy",
        label: "legacy ~/.codex/auth.json",
        accessToken: legacy.accessToken,
        accountId: legacy.accountId || "",
        available: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: "",
      },
    };
  }
  return missingAuthResult(
    route.model.profile
      ? `Codex auth profile "${route.model.profile}" is unavailable. Re-add it with \`shimex codex-auth add ${route.model.profile}\`.`
      : "Codex auth is not available. Add a profile with `shimex codex-auth add <name>` or paste ~/.codex/auth.json into one.",
  );
}

function shouldUseOnlyLegacyAuth(providerConfig, options) {
  if (providerConfig.options?.auths_path || providerConfig.options?.authsPath) {
    return false;
  }
  return Boolean(options.authPath || providerConfig.options?.auth_path || providerConfig.options?.authPath);
}

function missingAuthResult(message) {
  return {
    ok: false,
    result: jsonResult({
      error: { message, type: "shimex_auth_unavailable" },
    }, 401),
  };
}

function readSessionId(headers) {
  if (!headers) {
    return "";
  }
  const lookup = headers.get ? headers.get.bind(headers) : (name) => headers[name] || "";
  return lookup("session_id") || lookup("sessionId") || "";
}

async function passThroughResponseEvents(response, upstream, requestedModel) {
  const decoder = new TextDecoder();
  let buffer = "";
  let sawCompleted = false;
  let responseSnapshot = null;

  const processEvent = (event) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") {
      return;
    }
    try {
      const rewritten = rewriteResponseModel(JSON.parse(data), requestedModel);
      if (rewritten?.response && typeof rewritten.response === "object") {
        responseSnapshot = { ...responseSnapshot, ...rewritten.response };
      }
      if (rewritten?.type === "response.completed") {
        sawCompleted = true;
      }
      response.write(`data: ${JSON.stringify(rewritten)}\n\n`);
    } catch {
      response.write(`data: ${data}\n\n`);
    }
  };

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processEvent(event);
    }
  }
  buffer += decoder.decode().replace(/\r\n/g, "\n");
  if (buffer.trim()) {
    processEvent(buffer);
  }
  if (!sawCompleted) {
    const responseId = responseSnapshot?.id || `resp_${Date.now()}`;
    response.write(`data: ${JSON.stringify({
      type: "response.completed",
      response: {
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        output: [],
        usage: null,
        ...responseSnapshot,
        id: responseId,
        model: requestedModel,
        status: "completed",
      },
    })}\n\n`);
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
