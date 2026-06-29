export const openaiCompatibleProvider = {
  id: "openai-compatible",
  displayName: "OpenAI-Compatible Chat",
  kind: "byok",
  protocol: "openai-chat-compatible",
  auth: { type: "env-or-header" },
  capabilitySource: "configured",
  requestAdapter: "openai-compatible-chat",
  discoverModels(config) {
    return config.models;
  },
};

