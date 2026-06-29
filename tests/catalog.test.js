import { describe, expect, test } from "bun:test";
import { codexCatalogEntry } from "../src/clients/codex/catalog.js";
import { loadShimexConfig } from "../src/core/config.js";
import { slugify } from "../src/core/model.js";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { listProviderManifests } from "../src/providers/index.js";

describe("Shimex scaffold", () => {
  test("registers supported provider families", () => {
    const ids = listProviderManifests().map((provider) => provider.id);
    expect(ids).toContain("openai-compatible");
    expect(ids).toContain("openai-responses");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("cloudflare-workers-ai");
    expect(ids).toContain("ollama");
    expect(ids).toContain("lm-studio");
    expect(ids).toContain("chatgpt-codex");
    expect(ids).toContain("cursor-composer");
    expect(ids).toContain("cline-pass");
    expect(ids).toContain("auto-router");
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
    expect(entry.input_modalities).toEqual(["text", "image"]);
    expect(entry.supports_image_detail_original).toBe(true);
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
    expect(entry.input_modalities).toEqual(["text"]);
    expect(entry.supports_image_detail_original).toBe(false);
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
    expect(models.map((model) => model.slug)).toContain("openrouter-glm");
    expect(models.map((model) => model.slug)).toContain("composer-2-5");
  });

  test("slugifies provider model IDs", () => {
    expect(slugify("cline-pass/glm-5.2")).toBe("cline-pass-glm-5-2");
  });

  test("loads shimex.yml provider lists", async () => {
    const config = await loadShimexConfig();
    expect(config.runtime.port).toBe(8765);
    expect(config.providers.map((provider) => provider.id)).toContain("cline-pass");
    expect(config.providers.map((provider) => provider.id)).toContain("lm-studio");
  });
});
