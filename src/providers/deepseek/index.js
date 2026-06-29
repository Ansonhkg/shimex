export const deepSeekProvider = {
  id: "deepseek",
  displayName: "DeepSeek",
  kind: "byok",
  protocol: "anthropic-messages",
  auth: { type: "env", names: ["DEEPSEEK_API_KEY"] },
  capabilitySource: "configured",
  requestAdapter: "anthropic-messages",
  discoverModels(config) {
    return config.models;
  },
};
