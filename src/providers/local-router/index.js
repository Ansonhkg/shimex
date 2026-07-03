import { readProviderModelCache, shouldRefreshModels, writeProviderModelCache } from "../../core/modelCache.js";
import { openAiHeaders, joinEndpoint, upstreamError } from "../http.js";

export const localRouterProvider = {
  id: "local-router",
  displayName: "LocalRouter",
  kind: "byok",
  protocol: "openai-chat-compatible",
  auth: { type: "env", names: ["LOCALROUTER_API_KEY"] },
  capabilitySource: "discovery",
  requestAdapter: "openai-compatible-chat",
  async discoverModels(config, rootConfig) {
    if (config.models.length) {
      return config.models;
    }
    return rootConfig ? await readProviderModelCache(rootConfig, config) : [];
  },
  async refreshModels(config, rootConfig, options = {}) {
    if (!shouldRefreshModels(config)) {
      return { providerId: localRouterProvider.id, refreshed: false, reason: "refresh-disabled" };
    }
    if (!config.endpoint) {
      return { providerId: localRouterProvider.id, refreshed: false, reason: "endpoint-missing" };
    }
    const headers = openAiHeaders({ provider: localRouterProvider, providerConfig: config });
    if (!headers) {
      return { providerId: localRouterProvider.id, refreshed: false, reason: "auth-missing" };
    }
    try {
      const response = await (options.fetch || fetch)(joinEndpoint(config.endpoint, "/models"), {
        headers,
        signal: AbortSignal.timeout(Number(process.env.SHIMEX_MODEL_REFRESH_TIMEOUT_MS || 2500)),
      });
      if (!response.ok) {
        return { providerId: localRouterProvider.id, refreshed: false, reason: `http-${response.status}`, error: await upstreamError(response) };
      }
      const payload = await response.json();
      const models = normalizeLocalRouterModels(payload);
      if (!models.length) {
        return { providerId: localRouterProvider.id, refreshed: false, reason: "empty-response" };
      }
      const path = await writeProviderModelCache(rootConfig, config, models);
      return { providerId: localRouterProvider.id, refreshed: true, count: models.length, path };
    } catch (error) {
      return { providerId: localRouterProvider.id, refreshed: false, reason: String(error?.name || error?.message || error) };
    }
  },
};

function normalizeLocalRouterModels(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return data
    .filter((entry) => {
      const id = String(entry?.id || "").toLowerCase();
      return Boolean(id) && !id.includes("embedding") && !id.includes("embed");
    })
    .map((entry) => {
      const upstreamModel = String(entry?.id || entry?.name || "").trim();
      if (!upstreamModel) return null;

      // Derive provider prefix from owned_by or the upstream id prefix
      const upstreamPrefix = upstreamModel.includes(":")
        ? upstreamModel.split(":")[0]
        : "local";
      const baseModel = upstreamModel.includes(":")
        ? upstreamModel.split(":").slice(1).join(":")
        : upstreamModel;

      // Slug: local-router-<upstreamprefix>-<basemodel>
      const slug = `local-router-${upstreamPrefix}-${baseModel}`
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .toLowerCase()
        .replace(/^-+|-+$/g, "");

      return {
        slug,
        displayName: `LocalRouter: ${upstreamPrefix}/${baseModel}`,
        upstreamModel,
        contextWindow: Number(entry.context_window || entry.contextWindow || entry.context_length || 128000),
        inputModalities: Array.isArray(entry.input_modalities)
          ? entry.input_modalities.map(String)
          : Array.isArray(entry.inputModalities)
            ? entry.inputModalities.map(String)
            : ["text"],
      };
    })
    .filter(Boolean);
}
