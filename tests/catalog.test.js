import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { codexCatalogEntry } from "../src/clients/codex/catalog.js";
import { loadShimexConfig } from "../src/core/config.js";
import { slugify } from "../src/core/model.js";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { listProviderManifests } from "../src/providers/index.js";

describe("Shimex scaffold", () => {
  test("registers supported provider families", () => {
    const ids = listProviderManifests().map((provider) => provider.id);
    assert.ok(ids.includes("openai-compatible"));
    assert.ok(ids.includes("openai-responses"));
    assert.ok(ids.includes("anthropic"));
    assert.ok(ids.includes("cloudflare-workers-ai"));
    assert.ok(ids.includes("ollama"));
    assert.ok(ids.includes("lm-studio"));
    assert.ok(ids.includes("chatgpt-codex"));
    assert.ok(ids.includes("cursor-composer"));
    assert.ok(ids.includes("cline-pass"));
    assert.ok(ids.includes("auto-router"));
  });

  test("uses explicit image capabilities in the Codex catalog", () => {
    const entry = codexCatalogEntry({
      slug: "vision-model",
      displayName: "Vision Model",
      providerId: "test",
      upstreamModel: "vision",
      contextWindow: 128000,
      inputModalities: ["text", "image"],
    });
    assert.deepEqual(entry.input_modalities, ["text", "image"]);
    assert.equal(entry.supports_image_detail_original, true);
  });

  test("keeps text-only models text-only", () => {
    const entry = codexCatalogEntry({
      slug: "text-model",
      displayName: "Text Model",
      providerId: "test",
      upstreamModel: "text",
      contextWindow: 128000,
      inputModalities: ["text"],
    });
    assert.deepEqual(entry.input_modalities, ["text"]);
    assert.equal(entry.supports_image_detail_original, false);
  });

  test("discovers configured and static provider models", async () => {
    const config = {
      providers: [
        {
          id: "openai-compatible",
          enabled: true,
          models: [{
            slug: "openrouter-glm",
            displayName: "OpenRouter GLM",
            upstreamModel: "z-ai/glm-5.2",
            contextWindow: 1000000,
            inputModalities: ["text"],
          }],
        },
        { id: "cursor-composer", enabled: true, models: [] },
      ],
    };
    const models = await discoverModels(config);
    assert.ok(models.map((model) => model.slug).includes("openrouter-glm"));
    assert.ok(models.map((model) => model.slug).includes("composer-2-5"));
  });

  test("slugifies provider model IDs", () => {
    assert.equal(slugify("cline-pass/glm-5.2"), "cline-pass-glm-5-2");
  });

  test("loads shimex.yml provider lists", async () => {
    const config = await loadShimexConfig();
    assert.equal(config.runtime.port, 18765);
    assert.ok(config.providers.map((provider) => provider.id).includes("cline-pass"));
    assert.ok(config.providers.map((provider) => provider.id).includes("lm-studio"));
  });
});
