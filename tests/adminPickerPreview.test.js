import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";
import { codexDisplayName } from "../src/clients/codex/catalog.js";

describe("admin model picker preview", () => {
  test("renders Codex-style picker chrome", () => {
    const html = adminPage();
    assert.match(html, /Model picker preview/);
    assert.match(html, /id="models-section"/);
    assert.match(html, /picker-list/);
    assert.match(html, /picker-selected-label/);
    assert.match(html, /picker-selected-effort/);
    assert.match(html, /function pickerLabel\(/);
    assert.match(html, /pickerDisplayName/);
  });

  test("uses the same display naming as the Codex catalog", () => {
    assert.equal(
      codexDisplayName({
        displayName: "Grok 4.6",
        providerDisplayName: "Grok",
        providerId: "grok",
      }),
      "Grok: Grok 4.6",
    );
    assert.equal(
      codexDisplayName({
        displayName: "Kimi K3",
        providerDisplayName: "ClinePass",
        providerId: "cline-pass",
      }),
      "Kimi K3",
    );
  });
});
