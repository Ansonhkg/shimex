import { anthropicProvider } from "./anthropic/index.js";
import { autoRouterProvider } from "./auto-router/index.js";
import { chatgptCodexProvider } from "./chatgpt-codex/index.js";
import { clinePassProvider } from "./cline-pass/index.js";
import { cloudflareWorkersAiProvider } from "./cloudflare-workers-ai/index.js";
import { cursorComposerProvider } from "./cursor-composer/index.js";
import { deepSeekProvider } from "./deepseek/index.js";
import { lmStudioProvider } from "./lm-studio/index.js";
import { ollamaProvider } from "./ollama/index.js";
import { openaiCompatibleProvider } from "./openai-compatible/index.js";
import { openaiResponsesProvider } from "./openai-responses/index.js";

const providers = [
  anthropicProvider,
  autoRouterProvider,
  chatgptCodexProvider,
  clinePassProvider,
  cloudflareWorkersAiProvider,
  cursorComposerProvider,
  deepSeekProvider,
  lmStudioProvider,
  ollamaProvider,
  openaiCompatibleProvider,
  openaiResponsesProvider,
];

export function listProviderManifests() {
  return [...providers].sort((a, b) => a.id.localeCompare(b.id));
}

export function getProviderManifest(id) {
  return providers.find((provider) => provider.id === id) || null;
}
