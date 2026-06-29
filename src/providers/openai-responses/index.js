export const openaiResponsesProvider = {
  id: "openai-responses",
  displayName: "OpenAI Responses",
  kind: "byok",
  protocol: "openai-responses-compatible",
  auth: { type: "env-or-header" },
  capabilitySource: "configured",
  requestAdapter: "openai-compatible-responses",
  discoverModels(config) {
    return config.models;
  },
};

