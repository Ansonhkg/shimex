export const chatgptCodexProvider = {
  id: "chatgpt-codex",
  displayName: "ChatGPT Codex",
  kind: "external-session",
  protocol: "chatgpt-codex-responses",
  auth: { type: "external-codex-login" },
  capabilitySource: "codex-model-cache",
  requestAdapter: "chatgpt-codex-passthrough",
  discoverModels() {
    return [
      {
        slug: "gpt-5-5",
        displayName: "GPT-5.5",
        upstreamModel: "gpt-5.5",
        contextWindow: 400000,
        inputModalities: ["text", "image"],
        priority: 10000,
      },
    ];
  },
};

