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
    assert.equal(config.runtime.port, 5413);
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
        {
          slug: "gpt-5.6-sol",
          display_name: "GPT-5.6-Sol",
          context_window: 372000,
          input_modalities: ["text", "image"],
          default_reasoning_level: "low",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast responses with lighter reasoning" },
            { effort: "max", description: "Maximum reasoning depth for the hardest problems" },
            { effort: "ultra", description: "Maximum reasoning with automatic task delegation" },
          ],
          supports_image_detail_original: true,
          additional_speed_tiers: ["fast"],
          service_tiers: [{ id: "priority", name: "Fast", description: "1.5x speed, increased usage" }],
        },
        { slug: "gpt-5.6-terra", display_name: "GPT-5.6-Terra", context_window: 372000, input_modalities: ["text", "image"] },
        { slug: "gpt-5.6-luna", display_name: "GPT-5.6-Luna", context_window: 372000, input_modalities: ["text", "image"] },
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
    assert.deepEqual(models.map((model) => model.slug), [
      "gpt-5-6-sol",
      "gpt-5-6-terra",
      "gpt-5-6-luna",
      "gpt-5-5",
      "gpt-5-4",
      "gpt-5-4-mini",
      "gpt-5-3-codex-spark",
    ]);
    assert.equal(models[0]?.providerDisplayName, "ChatGPT Codex");
    const sol = codexCatalogEntry(models[0]);
    assert.equal(sol.context_window, 372000);
    assert.equal(sol.default_reasoning_level, "low");
    assert.deepEqual(sol.supported_reasoning_levels.map((level) => level.effort), ["low", "max", "ultra"]);
    assert.deepEqual(sol.additional_speed_tiers, ["fast"]);
    assert.equal(sol.service_tiers[0]?.id, "priority");
  });

  test("fills known Codex models when the dynamic cache is temporarily partial", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-model-cache-"));
    const cachePath = join(root, "models_cache.json");
    await writeFile(cachePath, JSON.stringify({
      models: [{ slug: "gpt-5.5", display_name: "GPT-5.5", context_window: 272000, input_modalities: ["text", "image"] }],
    }));
    const models = await discoverModels({
      providers: [{
        id: "chatgpt-codex",
        enabled: true,
        models: [],
        options: { models_cache_path: cachePath, show_without_auth: true },
      }],
    });
    assert.deepEqual(models.slice(0, 3).map((model) => model.slug), [
      "gpt-5-6-sol",
      "gpt-5-6-terra",
      "gpt-5-6-luna",
    ]);
    assert.equal(models[0].contextWindow, 372000);
    assert.deepEqual(models[0].supportedReasoningLevels.map((level) => level.effort), [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
  });
});
