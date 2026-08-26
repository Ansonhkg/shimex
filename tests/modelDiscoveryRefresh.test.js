import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateCodexCatalog } from "../src/clients/codex/catalog.js";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { clinePassProvider } from "../src/providers/cline-pass/index.js";
import { lmStudioProvider } from "../src/providers/lm-studio/index.js";
import { clearCursorAgentAuthCache } from "../src/providers/cursor-composer/cli.js";
import { cursorComposerProvider } from "../src/providers/cursor-composer/index.js";

describe("Provider model discovery refresh", () => {
  test("refreshes and reads cached ClinePass recommended models", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "shimex-discovery-"));
    const rootConfig = { runtime: { home: runtimeHome }, providers: [clineConfig()] };
    const result = await clinePassProvider.refreshModels(clineConfig(), rootConfig, {
      fetch: async () => jsonResponse({
        clinePass: [
          { id: "cline-pass/kimi-k2.6" },
          { id: "cline-pass/kimi-k3" },
        ],
      }),
    });

    assert.equal(result.refreshed, true);
    const models = await discoverModels(rootConfig);
    const kimiK2 = models.find((model) => model.upstreamModel === "cline-pass/kimi-k2.6");
    const kimiK3 = models.find((model) => model.upstreamModel === "cline-pass/kimi-k3");
    assert.equal(kimiK2.slug, "cline-pass-kimi-k2-6");
    assert.equal(kimiK2.providerDisplayName, "ClinePass");
    assert.equal(kimiK2.displayName, "Kimi K2.6");
    assert.equal(kimiK2.contextWindow, 262000);
    assert.deepEqual(kimiK2.inputModalities, ["text", "image"]);
    assert.equal(kimiK3.slug, "cline-pass-kimi-k3");
    assert.equal(kimiK3.displayName, "Kimi K3");
    assert.equal(kimiK3.contextWindow, 128000);
    assert.deepEqual(kimiK3.inputModalities, ["text"]);

    const catalogEntry = generateCodexCatalog(models).models.find((model) => model.slug === "cline-pass-kimi-k3");
    assert.equal(catalogEntry.display_name, "Kimi K3");
    assert.deepEqual(catalogEntry.input_modalities, ["text"]);
    assert.equal(catalogEntry.supports_image_detail_original, false);
  });

  test("refreshes and reads cached OpenAI-compatible /models responses", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "shimex-discovery-"));
    const providerConfig = {
      id: "lm-studio",
      enabled: true,
      endpoint: "http://127.0.0.1:1234/v1",
      auth: null,
      models: [],
      options: { models: { refresh: "on_start" } },
    };
    const rootConfig = { runtime: { home: runtimeHome }, providers: [providerConfig] };
    const result = await lmStudioProvider.refreshModels(providerConfig, rootConfig, {
      fetch: async (url) => {
        assert.equal(url, "http://127.0.0.1:1234/v1/models");
        return jsonResponse({
          data: [
            { id: "local-model", context_window: 32000 },
            { id: "text-embedding-nomic-embed-text-v1.5-embedding" },
          ],
        });
      },
    });

    assert.equal(result.refreshed, true);
    const models = await discoverModels(rootConfig);
    assert.equal(models.length, 1);
    assert.equal(models[0].slug, "lm-studio-local-model");
    assert.equal(models[0].providerDisplayName, "LM Studio");
    assert.equal(models[0].upstreamModel, "local-model");
    assert.deepEqual(models[0].inputModalities, ["text"]);
  });

  test("refreshes and reads the authenticated Cursor Agent model list", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "shimex-discovery-"));
    const agent = join(runtimeHome, "cursor-agent");
    await writeFile(agent, [
      "#!/bin/sh",
      "if [ \"$1\" = status ]; then exit 0; fi",
      "if [ \"$1\" = models ]; then",
      "  echo 'Available models'",
      "  echo 'gpt-5.5-low - GPT-5.5 1M Low'",
      "  echo 'gpt-5.5-medium - GPT-5.5 1M'",
      "  echo 'gpt-5.5-medium-fast - GPT-5.5 Fast'",
      "  echo 'gpt-5.5-high - GPT-5.5 1M High'",
      "  echo 'gpt-5.5-high-fast - GPT-5.5 High Fast'",
      "  echo 'composer-2.5 - Composer 2.5'",
      "  echo 'composer-2.5-fast - Composer 2.5 Fast'",
      "  echo 'claude-opus-4.8-thinking-low - Claude Opus 4.8 1M Low Thinking'",
      "  echo 'claude-opus-4.8-thinking-high - Claude Opus 4.8 1M Thinking'",
      "  echo 'Tip: use --model <id>'",
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"));
    await chmod(agent, 0o755);
    clearCursorAgentAuthCache();

    const providerConfig = {
      id: "cursor-composer",
      enabled: true,
      endpoint: "",
      auth: null,
      models: [],
      options: { cursor_agent_bin: agent, models: { refresh: "on_start" } },
    };
    const rootConfig = { runtime: { home: runtimeHome }, providers: [providerConfig] };
    const result = await cursorComposerProvider.refreshModels(providerConfig, rootConfig);

    assert.equal(result.refreshed, true);
    assert.equal(result.count, 3);
    const models = await discoverModels(rootConfig);
    assert.deepEqual(models.map((model) => model.slug), ["cursor-gpt-5-5", "composer-2-5", "cursor-claude-opus-4-8-thinking"]);
    assert.equal(models[0].upstreamModel, "gpt-5.5-medium");
    assert.equal(models[0].contextWindow, 128000);
    assert.deepEqual(models[0].inputModalities, ["text"]);
    assert.deepEqual(models[0].supportedReasoningLevels.map((level) => level.effort), ["low", "medium", "high"]);
    assert.deepEqual(models[0].additionalSpeedTiers, []);
    assert.equal(models[0].variantMap.reasoning.high.fast, "gpt-5.5-high-fast");
    assert.equal(models[1].contextWindow, 200000);
    assert.deepEqual(models[1].supportedReasoningLevels, []);
    assert.deepEqual(models[1].additionalSpeedTiers, ["fast"]);
    assert.equal(models[2].displayName, "Claude Opus 4.8 1M Thinking");
    assert.deepEqual(models[2].supportedReasoningLevels.map((level) => level.effort), ["low", "high"]);
  });
});

function clineConfig() {
  return {
    id: "cline-pass",
    enabled: true,
    endpoint: "",
    auth: null,
    models: [],
    options: { models: { refresh: "on_start" } },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
