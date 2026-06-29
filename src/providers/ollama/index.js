export const ollamaProvider = {
  id: "ollama",
  displayName: "Ollama",
  kind: "local",
  protocol: "openai-chat-compatible",
  auth: { type: "none" },
  capabilitySource: "configured-or-openai-models",
  requestAdapter: "openai-compatible-chat",
  discoverModels(config) {
    return config.models;
  },
};

