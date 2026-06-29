export const lmStudioProvider = {
  id: "lm-studio",
  displayName: "LM Studio",
  kind: "local",
  protocol: "openai-chat-compatible",
  auth: { type: "none" },
  capabilitySource: "configured-or-openai-models",
  requestAdapter: "openai-compatible-chat",
  discoverModels(config) {
    return config.models;
  },
};

