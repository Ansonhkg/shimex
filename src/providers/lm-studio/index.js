import { discoverOpenAiCompatibleModels, refreshOpenAiCompatibleModels } from "../openai-compatible/discovery.js";

export const lmStudioProvider = {
  id: "lm-studio",
  displayName: "LM Studio",
  kind: "local",
  protocol: "openai-chat-compatible",
  auth: { type: "none" },
  capabilitySource: "configured-or-openai-models",
  requestAdapter: "openai-compatible-chat",
  discoverModels(config, rootConfig) {
    return discoverOpenAiCompatibleModels(config, rootConfig);
  },
  refreshModels(config, rootConfig, options) {
    return refreshOpenAiCompatibleModels(config, rootConfig, lmStudioProvider, options);
  },
};
