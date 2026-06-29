import { discoverOpenAiCompatibleModels, refreshOpenAiCompatibleModels } from "../openai-compatible/discovery.js";

export const openaiResponsesProvider = {
  id: "openai-responses",
  displayName: "OpenAI Responses",
  kind: "byok",
  protocol: "openai-responses-compatible",
  auth: { type: "env-or-header" },
  capabilitySource: "configured",
  requestAdapter: "openai-compatible-responses",
  discoverModels(config, rootConfig) {
    return discoverOpenAiCompatibleModels(config, rootConfig);
  },
  refreshModels(config, rootConfig, options) {
    return refreshOpenAiCompatibleModels(config, rootConfig, openaiResponsesProvider, options);
  },
};
