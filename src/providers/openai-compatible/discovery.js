import { readProviderModelCache, shouldRefreshModels, writeProviderModelCache } from "../../core/modelCache.js";
import { authMissingResult, joinEndpoint, openAiHeaders, upstreamError } from "../http.js";

export async function discoverOpenAiCompatibleModels(config, rootConfig) {
  if (config.models.length) {
    return config.models;
  }
  return rootConfig ? await readProviderModelCache(rootConfig, config) : [];
}

export async function refreshOpenAiCompatibleModels(config, rootConfig, provider, options = {}) {
  if (!shouldRefreshModels(config)) {
    return { providerId: provider.id, refreshed: false, reason: "refresh-disabled" };
  }
  if (!config.endpoint) {
    return { providerId: provider.id, refreshed: false, reason: "endpoint-missing" };
  }
  const headers = openAiHeaders({ provider, providerConfig: config });
  if (!headers) {
    return { providerId: provider.id, refreshed: false, reason: authMissingResult(provider.id).error.type };
  }
  try {
    const response = await (options.fetch || fetch)(joinEndpoint(config.endpoint, "/models"), {
      headers,
      signal: AbortSignal.timeout(Number(process.env.SHIMEX_MODEL_REFRESH_TIMEOUT_MS || 2500)),
    });
    if (!response.ok) {
      return { providerId: provider.id, refreshed: false, reason: `http-${response.status}`, error: await upstreamError(response) };
    }
    const payload = await response.json();
    const models = normalizeModelsPayload(provider.id, payload);
    if (!models.length) {
      return { providerId: provider.id, refreshed: false, reason: "empty-response" };
    }
    const path = await writeProviderModelCache(rootConfig, config, models);
    return { providerId: provider.id, refreshed: true, count: models.length, path };
  } catch (error) {
    return { providerId: provider.id, refreshed: false, reason: String(error?.name || error?.message || error) };
  }
}

function normalizeModelsPayload(providerId, payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return data.filter(isSupportedChatModel).map((entry) => {
    const upstreamModel = String(entry?.id || entry?.name || "").trim();
    if (!upstreamModel) {
      return null;
    }
    return {
      slug: `${providerId}-${upstreamModel}`.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, ""),
      displayName: String(entry.display_name || entry.name || upstreamModel),
      upstreamModel,
      contextWindow: Number(entry.context_window || entry.contextWindow || entry.context_length || 128000),
      inputModalities: Array.isArray(entry.input_modalities)
        ? entry.input_modalities.map(String)
        : Array.isArray(entry.inputModalities)
          ? entry.inputModalities.map(String)
          : ["text"],
    };
  }).filter(Boolean);
}

function isSupportedChatModel(entry) {
  const id = String(entry?.id || entry?.name || "").toLowerCase();
  return Boolean(id) && !id.includes("embedding") && !id.includes("embed");
}
