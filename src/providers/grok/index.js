import { readFile } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";
import { readGrokAuth } from "./auth.js";

export const DEFAULT_GROK_ENDPOINT = "https://cli-chat-proxy.grok.com/v1";
const DEFAULT_GROK_MODELS_CACHE = "~/.grok/models_cache.json";
const DEFAULT_CLIENT_VERSION = "0.2.114";

const FALLBACK_GROK_MODELS = [
  {
    slug: "grok-4-5",
    displayName: "Grok 4.5",
    upstreamModel: "grok-4.5",
    contextWindow: 500000,
    inputModalities: ["text", "image"],
    reasoningLevel: "high",
    priority: 18000,
    supportedReasoningLevels: [
      { effort: "high", description: "Highest implementation quality with extensive reasoning" },
      { effort: "medium", description: "Balanced effort with standard implementation and testing" },
      { effort: "low", description: "Quick, fast implementations" },
    ],
  },
];

export const grokProvider = {
  id: "grok",
  displayName: "Grok",
  kind: "external-session",
  protocol: "openai-chat-compatible",
  auth: { type: "external-grok-login" },
  capabilitySource: "grok-model-cache",
  requestAdapter: "grok-session-chat",
  async discoverModels(config, rootConfig) {
    const baseModels = await readGrokModelCache(config) || FALLBACK_GROK_MODELS;
    if (config.options?.show_without_auth === true) {
      return baseModels;
    }
    const auth = await readGrokAuth({
      authPath: config.options?.auth_path || config.options?.authPath || config.auth?.path,
    });
    if (!auth?.accessToken) {
      return [];
    }
    return baseModels;
  },
  async refreshModels(config, rootConfig, options = {}) {
    const auth = await readGrokAuth({
      authPath: config.options?.auth_path || config.options?.authPath || config.auth?.path,
    });
    if (!auth?.accessToken) {
      return { providerId: "grok", refreshed: false, reason: "auth-unavailable" };
    }
    // Model catalog for the subscription proxy is session-backed and small.
    // Prefer the local Grok CLI cache; no separate network refresh is required.
    const models = await readGrokModelCache(config);
    return {
      providerId: "grok",
      refreshed: Boolean(models?.length),
      count: models?.length || 0,
      reason: models?.length ? "local-cache" : "fallback-models",
    };
  },
};

export async function resolveGrokClientVersion(providerConfig = {}, options = {}) {
  const configured = providerConfig.options?.client_version
    || providerConfig.options?.clientVersion
    || process.env.GROK_CLIENT_VERSION;
  if (configured) {
    return String(configured);
  }
  const cachePath = expandHome(
    providerConfig.options?.models_cache_path
      || providerConfig.options?.modelsCachePath
      || process.env.GROK_MODELS_CACHE_PATH
      || DEFAULT_GROK_MODELS_CACHE,
  );
  try {
    const payload = JSON.parse(await readFile(cachePath, "utf8"));
    if (payload?.grok_version) {
      return String(payload.grok_version);
    }
  } catch {
    // Fall through to default.
  }
  if (options.clientVersion) {
    return String(options.clientVersion);
  }
  return DEFAULT_CLIENT_VERSION;
}

async function readGrokModelCache(config) {
  const path = expandHome(
    config.options?.models_cache_path
      || config.options?.modelsCachePath
      || process.env.GROK_MODELS_CACHE_PATH
      || DEFAULT_GROK_MODELS_CACHE,
  );
  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  const models = payload?.models && typeof payload.models === "object" && !Array.isArray(payload.models)
    ? Object.values(payload.models)
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  const normalized = models.map((entry, index) => normalizeCachedModel(entry, index)).filter(Boolean);
  return normalized.length ? normalized : null;
}

function normalizeCachedModel(entry, index) {
  const info = entry?.info && typeof entry.info === "object" ? entry.info : entry;
  if (!info || typeof info !== "object") {
    return null;
  }
  if (info.hidden === true || info.supported_in_api === false) {
    return null;
  }
  const upstreamModel = String(info.id || info.model || entry?.id || "").trim();
  if (!upstreamModel) {
    return null;
  }
  const fallback = FALLBACK_GROK_MODELS.find((model) => model.upstreamModel === upstreamModel);
  const efforts = Array.isArray(info.reasoning_efforts)
    ? info.reasoning_efforts
      .map((item) => ({
        effort: String(item?.value || item?.id || item?.effort || "").trim(),
        description: String(item?.description || item?.label || "").trim(),
      }))
      .filter((item) => item.effort)
    : fallback?.supportedReasoningLevels || [];
  return {
    slug: upstreamModel.replace(/\./g, "-"),
    displayName: String(info.name || info.display_name || fallback?.displayName || upstreamModel),
    upstreamModel,
    contextWindow: Number(info.context_window || info.contextWindow || fallback?.contextWindow || 128000),
    inputModalities: Array.isArray(info.input_modalities)
      ? info.input_modalities.map(String)
      : Array.isArray(info.inputModalities)
        ? info.inputModalities.map(String)
        : fallback?.inputModalities || ["text", "image"],
    reasoningLevel: String(info.reasoning_effort || info.reasoningLevel || fallback?.reasoningLevel || "medium"),
    priority: Number(fallback?.priority || (18000 - index * 10)),
    supportedReasoningLevels: efforts,
  };
}
