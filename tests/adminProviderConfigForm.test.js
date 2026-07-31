import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";

describe("provider configuration forms", () => {
  test("renders configured-provider navigation and editable form controls", () => {
    const html = adminPage();

    for (const id of ["ollama", "deepseek", "cloudflare-workers-ai", "openai-responses", "lm-studio"]) {
      assert.match(html, new RegExp('data-provider-config-id="' + id + '"'));
      assert.match(html, new RegExp('data-view="provider-' + id + '"'));
    }
    assert.match(html, /provider-icon/);
    assert.match(html, /id="provider-config-form"/);
    assert.match(html, /id="provider-config-endpoint"/);
    assert.match(html, /id="provider-config-auth-type"/);
    assert.match(html, /id="provider-config-auth-name"/);
    assert.match(html, /id="provider-config-models"/);
    assert.match(html, /id="provider-config-save"/);
    assert.match(html, /id="provider-config-save-restart"/);
    assert.match(html, /function loadProviderConfigs\(/);
    assert.match(html, /function saveProviderConfig\(/);
    assert.match(html, /\/api\/config\/providers/);
  });
});
