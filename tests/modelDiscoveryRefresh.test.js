import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { clinePassProvider } from "../src/providers/cline-pass/index.js";
import { lmStudioProvider } from "../src/providers/lm-studio/index.js";

describe("Provider model discovery refresh", () => {
  test("refreshes and reads cached ClinePass recommended models", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "shimex-discovery-"));
    const rootConfig = { runtime: { home: runtimeHome }, providers: [clineConfig()] };
    const result = await clinePassProvider.refreshModels(clineConfig(), rootConfig, {
      fetch: async () => jsonResponse({
        clinePass: [{
          id: "cline-pass/kimi-k2.6",
        }],
      }),
    });

    assert.equal(result.refreshed, true);
    const models = await discoverModels(rootConfig);
    assert.equal(models[0].slug, "cline-pass-kimi-k2-6");
    assert.equal(models[0].providerDisplayName, "ClinePass");
    assert.equal(models[0].displayName, "Kimi K2.6");
    assert.equal(models[0].contextWindow, 262000);
    assert.deepEqual(models[0].inputModalities, ["text", "image"]);
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
