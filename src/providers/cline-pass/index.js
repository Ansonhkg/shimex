import { readProviderModelCache, shouldRefreshModels, writeProviderModelCache } from "../../core/modelCache.js";

const CLINE_PASS_RECOMMENDED_MODELS_URL = "https://api.cline.bot/api/v1/ai/cline/recommended-models";

export const CLINE_PASS_MODELS = [
  ["cline-pass/deepseek-v4-flash", "DeepSeek V4 Flash", 1000000, ["text"]],
  ["cline-pass/deepseek-v4-pro", "DeepSeek V4 Pro", 1000000, ["text"]],
  ["cline-pass/glm-5.2", "GLM-5.2", 1000000, ["text"]],
  ["cline-pass/kimi-k2.6", "Kimi K2.6", 262000, ["text", "image"]],
  ["cline-pass/kimi-k2.7-code", "Kimi K2.7 Code", 262000, ["text", "image"]],
  ["cline-pass/mimo-v2.5", "MiMo-V2.5", 32000, ["text", "image", "audio", "video"]],
  ["cline-pass/mimo-v2.5-pro", "MiMo-V2.5-Pro", 1000000, ["text"]],
  ["cline-pass/minimax-m3", "MiniMax-M3", 524000, ["text", "image", "video"]],
  ["cline-pass/qwen3.7-max", "Qwen3.7 Max", 1000000, ["text"]],
  ["cline-pass/qwen3.7-plus", "Qwen3.7 Plus", 1000000, ["text", "image"]],
];

export const clinePassProvider = {
  id: "cline-pass",
  displayName: "ClinePass",
  kind: "external-session",
  protocol: "openai-chat-compatible",
  auth: { type: "external-app", app: "cline" },
  capabilitySource: "provider-recommended-models",
  requestAdapter: "cline-pass-openai-chat",
  async discoverModels(config, rootConfig) {
    const cached = rootConfig ? await readProviderModelCache(rootConfig, config) : [];
    return (cached.length ? cached : fallbackModels()).map((model) => ({ ...model, priority: model.priority || 9500 }));
  },
  async refreshModels(config, rootConfig, options = {}) {
    if (!shouldRefreshModels(config)) {
      return { providerId: "cline-pass", refreshed: false, reason: "refresh-disabled" };
    }
    const fetchImpl = options.fetch || fetch;
    try {
      const response = await fetchImpl(CLINE_PASS_RECOMMENDED_MODELS_URL, {
        headers: { accept: "application/json", "user-agent": "shimex" },
        signal: AbortSignal.timeout(Number(process.env.SHIMEX_MODEL_REFRESH_TIMEOUT_MS || 2500)),
      });
      if (!response.ok) {
        return { providerId: "cline-pass", refreshed: false, reason: `http-${response.status}` };
      }
      const payload = await response.json();
      const models = normalizeClinePassRecommended(payload.clinePass);
      if (!models.length) {
        return { providerId: "cline-pass", refreshed: false, reason: "empty-response" };
      }
      const path = await writeProviderModelCache(rootConfig, config, models);
      return { providerId: "cline-pass", refreshed: true, count: models.length, path };
    } catch (error) {
      return { providerId: "cline-pass", refreshed: false, reason: String(error?.name || error?.message || error) };
    }
  },
};

export function isClinePassModelSlug(slug) {
  return CLINE_PASS_MODELS.some(([upstreamModel]) => slugFor(upstreamModel) === slug);
}

export function clinePassUpstreamModel(slug) {
  return CLINE_PASS_MODELS.find(([upstreamModel]) => slugFor(upstreamModel) === slug)?.[0] || slug;
}

export function clinePassInputModalities(slug) {
  return CLINE_PASS_MODELS.find(([upstreamModel]) => slugFor(upstreamModel) === slug)?.[3] || ["text"];
}

function slugFor(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, "");
}

function fallbackModels() {
  return CLINE_PASS_MODELS.map(([upstreamModel, displayName, contextWindow, inputModalities]) => ({
    slug: slugFor(upstreamModel),
    displayName,
    upstreamModel,
    contextWindow,
    inputModalities,
    priority: 9500,
  }));
}

function normalizeClinePassRecommended(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const fallbackById = new Map(fallbackModels().map((model) => [model.upstreamModel, model]));
  return value.map((entry) => {
    const upstreamModel = String(entry?.id || "").trim();
    if (!upstreamModel) {
      return null;
    }
    const fallback = fallbackById.get(upstreamModel);
    const inputModalities = normalizeModalities(entry, fallback);
    return {
      slug: slugFor(upstreamModel),
      displayName: displayNameFor(entry, upstreamModel, fallback),
      upstreamModel,
      contextWindow: Number(entry.contextWindow || entry.context_window || fallback?.contextWindow || 128000),
      inputModalities,
      priority: 9500,
    };
  }).filter(Boolean);
}

function displayNameFor(entry, upstreamModel, fallback) {
  const name = String(entry.name || "").trim();
  if (name && name !== upstreamModel) {
    return name;
  }
  return fallback?.displayName || upstreamModel.replace(/^cline-pass\//, "");
}

function normalizeModalities(entry, fallback) {
  if (Array.isArray(entry.inputModalities) && entry.inputModalities.length) {
    return entry.inputModalities.map(String);
  }
  if (Array.isArray(entry.input_modalities) && entry.input_modalities.length) {
    return entry.input_modalities.map(String);
  }
  if (fallback?.inputModalities?.length) {
    return fallback.inputModalities;
  }
  return entry.supportsImages ? ["text", "image"] : ["text"];
}
