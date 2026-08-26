import { readProviderModelCache, shouldRefreshModels, writeProviderModelCache } from "../../core/modelCache.js";
import { checkCursorAgentAuth, listCursorAgentModels } from "./cli.js";
import { normalizeCursorAgentModels } from "./models.js";

const FALLBACK_CURSOR_MODELS = [
  {
    slug: "composer-2-5",
    displayName: "Composer 2.5",
    upstreamModel: "composer-2.5",
    contextWindow: 200000,
    inputModalities: ["text"],
    priority: 11000,
    reasoningLevelsKnown: true,
    variantMap: { default: { standard: "composer-2.5" }, reasoning: {} },
  },
];

export const cursorComposerProvider = {
  id: "cursor-composer",
  displayName: "Cursor",
  kind: "external-cli-session",
  protocol: "cursor-agent",
  auth: { type: "external-cli-login", command: "cursor-agent status" },
  capabilitySource: "cursor-agent-model-list",
  requestAdapter: "cursor-agent-bridge",
  async discoverModels(config, rootConfig) {
    const cached = rootConfig ? await readProviderModelCache(rootConfig, config) : [];
    const models = cached.length ? cached : FALLBACK_CURSOR_MODELS;
    const auth = await checkCursorAgentAuth(config);
    return auth.authenticated ? models : [];
  },
  async refreshModels(config, rootConfig, options = {}) {
    if (!rootConfig) {
      return { providerId: "cursor-composer", refreshed: false, reason: "runtime-config-missing" };
    }
    if (!options.force && !shouldRefreshModels(config)) {
      return { providerId: "cursor-composer", refreshed: false, reason: "refresh-disabled" };
    }
    const auth = await checkCursorAgentAuth(config);
    if (!auth.authenticated || auth.bypassed) {
      return {
        providerId: "cursor-composer",
        refreshed: false,
        reason: auth.bypassed ? "auth-bypassed" : (auth.reason || "auth-unavailable"),
      };
    }
    try {
      const result = await listCursorAgentModels(config);
      const models = normalizeCursorAgentModels(result.models, FALLBACK_CURSOR_MODELS);
      if (!models.length) {
        return { providerId: "cursor-composer", refreshed: false, reason: "empty-response" };
      }
      const path = await writeProviderModelCache(rootConfig, config, models);
      return {
        providerId: "cursor-composer",
        refreshed: true,
        count: models.length,
        path,
      };
    } catch (error) {
      return {
        providerId: "cursor-composer",
        refreshed: false,
        reason: String(error?.name || error?.message || error),
      };
    }
  },
};
