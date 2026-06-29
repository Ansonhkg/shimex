import { discoverOpenAiCompatibleModels, refreshOpenAiCompatibleModels } from "../openai-compatible/discovery.js";

export const cloudflareWorkersAiProvider = {
  id: "cloudflare-workers-ai",
  displayName: "Cloudflare Workers AI",
  kind: "byok",
  protocol: "openai-chat-compatible",
  auth: { type: "env", names: ["CLOUDFLARE_AUTH_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] },
  capabilitySource: "configured",
  requestAdapter: "openai-compatible-chat",
  discoverModels(config, rootConfig) {
    return discoverOpenAiCompatibleModels(config, rootConfig);
  },
  refreshModels(config, rootConfig, options) {
    return refreshOpenAiCompatibleModels(config, rootConfig, cloudflareWorkersAiProvider, options);
  },
};
