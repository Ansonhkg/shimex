import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listShimexProviderSections,
  readShimexConfigFile,
  replaceShimexProviderSection,
  validateShimexConfigText,
  writeShimexConfigFile,
} from "../src/core/configFile.js";

const SAMPLE = `project:
  name: shimex
  package_manager: npm

runtime:
  host: 127.0.0.1
  port: 5413
  home: ~/.shimex

providers:
  - id: deepseek
    enabled: true
    endpoint: https://api.deepseek.com
    models:
      - slug: deepseek-v4-flash
        display_name: DeepSeek V4 Flash
        upstream_model: deepseek-v4-flash
        context_window: 131072
        input_modalities: [text]
`;

describe("shimex.yml config file helpers", () => {
  test("validates and rewrites a config file with backup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shimex-config-"));
    const path = join(dir, "shimex.yml");
    await writeFile(path, SAMPLE);

    const validation = await validateShimexConfigText(SAMPLE, { path });
    assert.equal(validation.providerCount, 1);
    assert.equal(validation.enabledProviders, 1);

    const next = SAMPLE.replace("enabled: true", "enabled: false");
    const saved = await writeShimexConfigFile(next, { path });
    assert.equal(saved.ok, true);
    assert.equal(saved.requiresRestart, true);
    assert.equal(saved.enabledProviders, 0);
    assert.match(await readFile(path, "utf8"), /enabled: false/);
    assert.match(await readFile(`${path}.bak`, "utf8"), /enabled: true/);

    const loaded = await readShimexConfigFile({ path });
    assert.match(loaded.text, /enabled: false/);
  });

  test("rejects empty or invalid yaml", async () => {
    await assert.rejects(() => validateShimexConfigText("   "), /cannot be empty/);
    await assert.rejects(() => validateShimexConfigText("- not: a: mapping"), /Invalid YAML|expected key/);
  });

  test("lists and replaces only one provider section for the form editor", async () => {
    const text = [
      SAMPLE,
      "  - id: ollama",
      "    enabled: true",
      "    endpoint: http://127.0.0.1:11434/v1",
      "    models: []",
      "",
      "runtime_note: keep-this",
      "",
    ].join("\n");
    const sections = listShimexProviderSections(text);
    assert.deepEqual(sections.map((provider) => provider.id), ["deepseek", "ollama"]);

    const updated = replaceShimexProviderSection(text, "deepseek", {
      id: "deepseek",
      enabled: false,
      endpoint: "https://api.deepseek.com/anthropic",
      auth: { type: "env", name: "DEEPSEEK_API_KEY" },
      models: [{
        slug: "deepseek-v4-flash",
        display_name: "DeepSeek V4 Flash",
        upstream_model: "deepseek-v4-flash",
        context_window: 131072,
        input_modalities: ["text"],
      }],
    });

    assert.match(updated, /enabled: false/);
    assert.match(updated, /DEEPSEEK_API_KEY/);
    assert.match(updated, /- id: ollama[\s\S]*endpoint: http:\/\/127\.0\.0\.1:11434\/v1/);
    assert.match(updated, /runtime_note: keep-this/);
    const validation = await validateShimexConfigText(updated);
    assert.equal(validation.providerCount, 2);
  });
});
