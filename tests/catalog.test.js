import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    assert.ok(ids.includes("deepseek"));
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
      providerDisplayName: "Test Provider",
      upstreamModel: "vision",
      contextWindow: 128000,
      inputModalities: ["text", "image"],
    });
    assert.equal(entry.display_name, "Test Provider: Vision Model");
    assert.match(entry.description, /routed through Test Provider via Shimex/);
    assert.deepEqual(entry.input_modalities, ["text", "image"]);
    assert.equal(entry.supports_image_detail_original, true);
  });

  test("filters unsupported Codex catalog modalities", () => {
    const entry = codexCatalogEntry({
      slug: "multimodal-model",
      displayName: "Multimodal Model",
      providerId: "test",
      providerDisplayName: "Test Provider",
      upstreamModel: "multimodal",
      contextWindow: 128000,
      inputModalities: ["text", "image", "audio", "video"],
    });
    assert.deepEqual(entry.input_modalities, ["text", "image"]);
    assert.equal(entry.supports_image_detail_original, true);
  });

  test("keeps text-only models text-only", () => {
    const entry = codexCatalogEntry({
      slug: "text-model",
      displayName: "Text Model",
      providerId: "test",
      providerDisplayName: "Test Provider",
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
    const openRouter = models.find((model) => model.slug === "openrouter-glm");
    const composer = models.find((model) => model.slug === "composer-2-5");
    assert.equal(openRouter?.providerDisplayName, "OpenAI-Compatible Chat");
    assert.equal(composer?.providerDisplayName, "Cursor Composer");
  });

  test("slugifies provider model IDs", () => {
    assert.equal(slugify("cline-pass/glm-5.2"), "cline-pass-glm-5-2");
  });

  test("loads shimex.yml provider lists", async () => {
    const config = await loadShimexConfig();
    assert.equal(config.runtime.port, 18765);
    assert.equal(config.codex.seedLocalAuth, true);
    assert.equal(config.codex.localAuthKey, "shimex-local-api-key");
    assert.equal(config.codex.bundleIdentifier, "xyz.shimex.app");
    assert.ok(config.codex.iconPath.endsWith("/icon.png"));
    assert.ok(config.providers.map((provider) => provider.id).includes("cline-pass"));
    assert.ok(config.providers.map((provider) => provider.id).includes("lm-studio"));
    assert.ok(config.providers.find((provider) => provider.id === "deepseek")?.models.some((model) => model.slug === "deepseek-v4-pro"));
    assert.ok(config.providers.find((provider) => provider.id === "cloudflare-workers-ai")?.models.some((model) => model.slug === "cloudflare-glm-5-2"));
    assert.equal(config.providers.find((provider) => provider.id === "chatgpt-codex")?.enabled, true);
  });

  test("hides ChatGPT Codex models when external auth is unavailable", async () => {
    const missingAuthPath = join(await mkdtemp(join(tmpdir(), "shimex-auth-")), "missing-auth.json");
    const models = await discoverModels({
      providers: [{
        id: "chatgpt-codex",
        enabled: true,
        auth: { type: "external-codex-login", path: missingAuthPath },
        models: [],
        options: {},
      }],
    });
    assert.deepEqual(models, []);
  });

  test("can expose ChatGPT Codex models when explicit external auth exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-auth-"));
    const authPath = join(root, "auth.json");
    const cachePath = join(root, "models_cache.json");
    await writeFile(authPath, JSON.stringify({ tokens: { access_token: "codex-token" } }));
    await writeFile(cachePath, JSON.stringify({
      models: [
        { slug: "gpt-5.5", display_name: "GPT-5.5", context_window: 272000, input_modalities: ["text", "image"] },
        { slug: "gpt-5.4", display_name: "GPT-5.4", context_window: 272000, input_modalities: ["text", "image"] },
        { slug: "gpt-5.4-mini", display_name: "GPT-5.4-Mini", context_window: 272000, input_modalities: ["text", "image"] },
        { slug: "gpt-5.3-codex-spark", display_name: "GPT-5.3-Codex-Spark", context_window: 128000, input_modalities: ["text"] },
        { slug: "codex-auto-review", display_name: "Codex Auto Review", context_window: 272000, input_modalities: ["text"] },
      ],
    }));
    const models = await discoverModels({
      providers: [{
        id: "chatgpt-codex",
        enabled: true,
        auth: { type: "external-codex-login", path: authPath },
        models: [],
        options: { models_cache_path: cachePath },
      }],
    });
    assert.deepEqual(models.map((model) => model.slug), ["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-5-3-codex-spark"]);
    assert.equal(models[0]?.providerDisplayName, "ChatGPT Codex");
  });
});
