import { readCodexAuth } from "./auth.js";

export const chatgptCodexProvider = {
  id: "chatgpt-codex",
  displayName: "ChatGPT Codex",
  kind: "external-session",
  protocol: "chatgpt-codex-responses",
  auth: { type: "external-codex-login" },
  capabilitySource: "codex-model-cache",
  requestAdapter: "chatgpt-codex-passthrough",
  async discoverModels(config) {
    if (config.options?.show_without_auth !== true) {
      const auth = await readCodexAuth({ authPath: codexAuthPath(config) });
      if (!auth) {
        return [];
      }
    }
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

function codexAuthPath(config) {
  return config.auth?.path || config.options?.auth_path || config.options?.authPath;
}
