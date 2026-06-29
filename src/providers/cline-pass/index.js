export const CLINE_PASS_MODELS = [
  ["cline-pass/deepseek-v4-flash", "DeepSeek V4 Flash", 1000000, ["text"]],
  ["cline-pass/deepseek-v4-pro", "DeepSeek V4 Pro", 1000000, ["text"]],
  ["cline-pass/glm-5.2", "GLM-5.2", 1000000, ["text"]],
  ["cline-pass/kimi-k2.6", "Kimi K2.6", 262000, ["text", "image"]],
  ["cline-pass/kimi-k2.7-code", "Kimi K2.7 Code", 262000, ["text", "image"]],
  ["cline-pass/mimo-v2.5", "MiMo-V2.5", 32000, ["text", "image", "audio", "video"]],
  ["cline-pass/mimo-v2.5-pro", "MiMo-V2.5-Pro", 1000000, ["text"]],
  ["cline-pass/minimax-m3", "MiniMax-M3", 524000, ["text", "image", "video"]],
  ["cline-pass/qwen3.7-max", "Qwen3.7 Max", 1000000, ["text"]],
  ["cline-pass/qwen3.7-plus", "Qwen3.7 Plus", 1000000, ["text", "image"]],
];

export const clinePassProvider = {
  id: "cline-pass",
  displayName: "ClinePass",
  kind: "external-session",
  protocol: "openai-chat-compatible",
  auth: { type: "external-app", app: "cline" },
  capabilitySource: "provider-recommended-models",
  requestAdapter: "cline-pass-openai-chat",
  discoverModels() {
    return CLINE_PASS_MODELS.map(([upstreamModel, displayName, contextWindow, inputModalities]) => ({
      slug: upstreamModel.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, ""),
      displayName,
      upstreamModel,
      contextWindow,
      inputModalities,
      priority: 9500,
    }));
  },
};

