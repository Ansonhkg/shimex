export const anthropicProvider = {
  id: "anthropic",
  displayName: "Anthropic",
  kind: "byok",
  protocol: "anthropic-messages",
  auth: { type: "env", names: ["ANTHROPIC_API_KEY"] },
  capabilitySource: "configured",
  requestAdapter: "anthropic-messages",
  discoverModels(config) {
    return config.models;
  },
};

