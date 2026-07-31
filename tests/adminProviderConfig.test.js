import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { adminPage } from "../src/admin/page.js";
import { providerConfigCard, providerConfigRuntimeHelpers } from "../src/admin/providerConfigCard.js";

describe("admin provider config UI", () => {
  test("provider form uses stacked field layout classes instead of bare inline labels", () => {
    const html = providerConfigCard();
    assert.match(html, /id="provider-config-form"/);
    assert.match(html, /class="provider-config-card"/);
    assert.match(html, /class="provider-config-fields"/);
    assert.match(html, /class="provider-field"/);
    assert.match(html, /id="provider-config-endpoint"/);
    assert.match(html, /id="provider-config-auth-type"/);
    assert.match(html, /id="provider-config-auth-name"/);
    assert.match(html, /id="provider-config-add-model"/);
    assert.match(html, /id="provider-config-save"/);
    // Identity lives in the page topbar; form should not re-render a second H2 title.
    assert.doesNotMatch(html, /<h2 id="provider-config-name"/);
    assert.match(html, /id="provider-config-name"/);
  });

  test("admin page CSS defines provider form grid layout", () => {
    const html = adminPage();
    assert.match(html, /\.provider-config-fields\s*\{/);
    assert.match(html, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(html, /\.provider-field\s*\{/);
    assert.match(html, /display:\s*grid/);
    assert.match(html, /\.provider-config-actions\s*\{/);
    assert.match(html, /\.provider-model-grid\s*\{/);
  });

  test("provider runtime still wires form fields and save paths", () => {
    const js = providerConfigRuntimeHelpers();
    for (const needle of [
      "function initProviderConfig()",
      "function renderProviderConfig(",
      "function renderProviderModels(",
      "async function saveProviderConfig(",
      "/api/config/providers",
      "provider-config-endpoint",
      "provider-config-auth-type",
      "provider-config-auth-name",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
  });
});
