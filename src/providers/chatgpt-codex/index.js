import { readFile } from "node:fs/promises";
import {
  authStorePath,
  readCodexAuths,
  resolveProfileForSlug as resolveProfileForSlugInStore,
} from "./authStore.js";
import { readCodexAuth } from "./auth.js";
import { expandHome } from "../../core/paths.js";

const DEFAULT_CODEX_MODEL_CACHE = "~/.codex/models_cache.json";
const DEFAULT_CODEX_MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
];

const FAST_SERVICE_TIER = {
  id: "priority",
  name: "Fast",
  description: "1.5x speed, increased usage",
};

const FALLBACK_CODEX_MODELS = [
  codexModel("gpt-5.6-sol", "GPT-5.6-Sol", 372000, ["text", "image"], "low", 20030, codex56Metadata(["low", "medium", "high", "xhigh", "max", "ultra"])),
  codexModel("gpt-5.6-terra", "GPT-5.6-Terra", 372000, ["text", "image"], "medium", 20020, codex56Metadata(["low", "medium", "high", "xhigh", "max", "ultra"])),
  codexModel("gpt-5.6-luna", "GPT-5.6-Luna", 372000, ["text", "image"], "medium", 20010, codex56Metadata(["low", "medium", "high", "xhigh", "max"])),
  codexModel("gpt-5.5", "GPT-5.5", 272000, ["text", "image"], "medium", 20000),
  codexModel("gpt-5.4", "GPT-5.4", 272000, ["text", "image"], "medium", 19990),
  codexModel("gpt-5.4-mini", "GPT-5.4-Mini", 272000, ["text", "image"], "medium", 19980),
  codexModel("gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark", 128000, ["text"], "high", 19970),
];

export const chatgptCodexProvider = {
  id: "chatgpt-codex",
  displayName: "ChatGPT Codex",
  kind: "external-session",
  protocol: "chatgpt-codex-responses",
  auth: { type: "external-codex-login" },
  capabilitySource: "codex-model-cache",
  requestAdapter: "chatgpt-codex-passthrough",
  async discoverModels(config, rootConfig) {
    const baseModels = await readCodexModelCache(config) || FALLBACK_CODEX_MODELS;
    if (config.options?.show_without_auth === true) {
      return baseModels;
    }
    const store = hasExplicitLegacyAuthPath(config) && !hasExplicitAuthStorePath(config)
      ? { profiles: {}, defaultProfile: "" }
      : await loadAuthStore(config, rootConfig);
    const profileNames = Object.keys(store.profiles);
    if (profileNames.length) {
      const defaultProfile = store.defaultProfile && store.profiles[store.defaultProfile]?.accessToken
        ? store.profiles[store.defaultProfile]
        : null;
      const defaultModels = defaultProfile
        ? baseModels.map((model, modelIndex) => ({
          ...model,
          profile: defaultProfile.name,
          priority: (model.priority || (20000 - modelIndex * 10)) + 1000,
          upstreamModel: model.upstreamModel,
        }))
        : [];
      const scopedModels = profileNames.flatMap((profileName, profileIndex) => {
        const profile = store.profiles[profileName];
        if (!profile || !profile.accessToken) {
          return [];
        }
        return baseModels.map((model, modelIndex) => ({
          ...model,
          slug: `${profileName}-${model.slug}`,
          displayName: `${profileName}: ${model.displayName}`,
          priority: (model.priority || (20000 - modelIndex * 10)) - profileIndex * 100,
          profile: profileName,
          upstreamModel: model.upstreamModel,
        }));
      });
      return [...defaultModels, ...scopedModels];
    }
    if (config.options?.require_auth === true) {
      return [];
    }
    const legacy = await readLegacyCodexAuth(config);
    if (!legacy) {
      return [];
    }
    return baseModels;
  },
};

export async function loadAuthStore(config, rootConfig) {
  return await readCodexAuths(authStorePath(config, rootConfig));
}

async function readCodexModelCache(config) {
  const path = expandHome(
    config.options?.models_cache_path
      || config.options?.modelsCachePath
      || process.env.CODEX_MODELS_CACHE_PATH
      || DEFAULT_CODEX_MODEL_CACHE,
  );
  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  const sourceModels = Array.isArray(payload?.models) ? payload.models : Array.isArray(payload) ? payload : [];
  const models = DEFAULT_CODEX_MODEL_IDS.map((id, index) => {
    const raw = sourceModels.find((model) => model?.slug === id || model?.id === id || model?.model === id);
    if (!raw) {
      return FALLBACK_CODEX_MODELS[index];
    }
    return codexModel(
      id,
      raw.displayName || raw.display_name || raw.name || id,
      raw.contextWindow || raw.context_window || raw.max_context_window || FALLBACK_CODEX_MODELS[index].contextWindow,
      raw.inputModalities || raw.input_modalities || FALLBACK_CODEX_MODELS[index].inputModalities,
      raw.reasoningLevel || raw.reasoning_level || raw.default_reasoning_level || FALLBACK_CODEX_MODELS[index].reasoningLevel,
      20000 - (index * 10),
      codexCacheMetadata(raw),
    );
  });
  return models;
}

function codexModel(upstreamModel, displayName, contextWindow, inputModalities, reasoningLevel, priority, metadata = {}) {
  return {
    slug: upstreamModel.replace(/\./g, "-"),
    displayName,
    upstreamModel,
    contextWindow,
    inputModalities,
    reasoningLevel,
    priority,
    ...metadata,
  };
}

function codexCacheMetadata(raw) {
  return {
    supportedReasoningLevels: raw.supportedReasoningLevels || raw.supported_reasoning_levels || [],
    supportsReasoningSummaries: raw.supportsReasoningSummaries ?? raw.supports_reasoning_summaries ?? false,
    defaultReasoningSummary: raw.defaultReasoningSummary || raw.default_reasoning_summary || "none",
    supportVerbosity: raw.supportVerbosity ?? raw.support_verbosity ?? false,
    defaultVerbosity: raw.defaultVerbosity || raw.default_verbosity || "low",
    supportsImageDetailOriginal: raw.supportsImageDetailOriginal ?? raw.supports_image_detail_original ?? null,
    effectiveContextWindowPercent: raw.effectiveContextWindowPercent || raw.effective_context_window_percent || null,
    additionalSpeedTiers: raw.additionalSpeedTiers || raw.additional_speed_tiers || [],
    serviceTiers: raw.serviceTiers || raw.service_tiers || [],
    useResponsesLite: raw.useResponsesLite ?? raw.use_responses_lite ?? null,
    toolMode: raw.toolMode || raw.tool_mode || "",
    supportsSearchTool: raw.supportsSearchTool ?? raw.supports_search_tool ?? false,
    webSearchToolType: raw.webSearchToolType || raw.web_search_tool_type || null,
  };
}

function codex56Metadata(efforts) {
  const descriptions = {
    low: "Fast responses with lighter reasoning",
    medium: "Balances speed and reasoning depth for everyday tasks",
    high: "Greater reasoning depth for complex problems",
    xhigh: "Extra high reasoning depth for complex problems",
    max: "Maximum reasoning depth for the hardest problems",
    ultra: "Maximum reasoning with automatic task delegation",
  };
  return {
    supportedReasoningLevels: efforts.map((effort) => ({ effort, description: descriptions[effort] })),
    supportsReasoningSummaries: true,
    defaultReasoningSummary: "none",
    supportVerbosity: true,
    defaultVerbosity: "low",
    supportsImageDetailOriginal: true,
    effectiveContextWindowPercent: 95,
    additionalSpeedTiers: ["fast"],
    serviceTiers: [FAST_SERVICE_TIER],
    useResponsesLite: true,
    toolMode: "code_mode_only",
  };
}

function readLegacyCodexAuth(config) {
  if (config.options?.legacy_single_account === false) {
    return Promise.resolve(null);
  }
  const explicit = config.auth?.path
    || config.options?.auth_path
    || config.options?.authPath;
  return readCodexAuth({ authPath: explicit || undefined });
}

function hasExplicitAuthStorePath(config) {
  return Boolean(config.options?.auths_path || config.options?.authsPath);
}

function hasExplicitLegacyAuthPath(config) {
  return Boolean(config.auth?.path || config.options?.auth_path || config.options?.authPath);
}

export { resolveProfileForSlugInStore as resolveProfileForSlug };
