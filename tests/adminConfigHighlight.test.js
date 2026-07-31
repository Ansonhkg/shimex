import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";

describe("admin config syntax highlighting", () => {
  test("embeds a dual-layer YAML highlighter", () => {
    const html = adminPage();
    assert.match(html, /class="config-editor-shell"/);
    assert.match(html, /id="config-highlight"/);
    assert.match(html, /id="config-highlight-code"/);
    assert.match(html, /function highlightYaml\(/);
    assert.match(html, /function renderConfigHighlight\(/);
    assert.match(html, /\.tok-key/);
    assert.match(html, /\.tok-string/);
    assert.match(html, /\.tok-env/);
    assert.match(html, /\.tok-comment/);
  });

  test("highlights keys, booleans, numbers, comments, and env refs", () => {
    const html = adminPage();
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const escapeStart = script.indexOf("function escapeHtml");
    const escapeEnd = script.indexOf("function normalizeView");
    const helpersStart = script.indexOf("function highlightYaml(source)");
    // Stop before render/config helpers that close over `els`.
    const helpersEnd = script.indexOf("function renderConfigHighlight");
    assert.ok(escapeStart >= 0 && helpersStart >= 0 && helpersEnd > helpersStart);

    const sample = [
      "project:",
      "  name: shimex # hi",
      "  enabled: true",
      "  port: 5413",
      "  token: ${CLOUDFLARE_AUTH_TOKEN}",
      "  models: [text, image]",
    ].join("\n");

    const runner = new Function(
      `${script.slice(escapeStart, escapeEnd)}\n${script.slice(helpersStart, helpersEnd)}\nreturn highlightYaml(${JSON.stringify(sample)});`,
    );
    const out = runner();
    assert.match(out, /tok-key/);
    assert.match(out, /tok-bool/);
    assert.match(out, /tok-number/);
    assert.match(out, /tok-comment/);
    assert.match(out, /tok-env/);
    assert.match(out, /CLOUDFLARE_AUTH_TOKEN/);
  });
});
