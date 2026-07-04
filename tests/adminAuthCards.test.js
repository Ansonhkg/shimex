import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { codexAuthsCard, codexAuthsRuntimeHelpers } from "../src/admin/codexAuthsCard.js";
import { clineAuthsCard, clineAuthsRuntimeHelpers } from "../src/admin/clineAuthsCard.js";

describe("admin auth card markup", () => {
  test("codexAuthsCard renders profile-card container with sign-in and paste affordances", () => {
    const html = codexAuthsCard();
    assert.match(html, /class="auth-panel span-12"/);
    assert.match(html, /id="codex-auths-panel"/);
    assert.match(html, /id="codex-auths-title"/);
    assert.match(html, /id="codex-auths-rows"/);
    assert.match(html, /class="auth-profiles"/);
    assert.match(html, /id="codex-auths-device-start"/);
    assert.match(html, /id="codex-auths-paste-save"/);
    // Loading state is shown up-front instead of a skeleton table row.
    assert.match(html, /Loading Codex profiles/);
    // Refresh button is present in the head.
    assert.match(html, /id="codex-auths-refresh"/);
    // Sign-in section is visible (no display:none) — regression guard.
    assert.doesNotMatch(html, /id="codex-auths-actions" style="display:none"/);
    // Paste-JSON details is a visible collapsed <details>.
    assert.doesNotMatch(html, /id="codex-auths-paste-details" style="display:none/);
    // No legacy <table> markup should remain after the redesign.
    assert.doesNotMatch(html, /<table/);
  });

  test("clineAuthsCard mirrors the codex card structure", () => {
    const html = clineAuthsCard();
    assert.match(html, /class="auth-panel span-12"/);
    assert.match(html, /id="cline-auths-panel"/);
    assert.match(html, /id="cline-auths-title"/);
    assert.match(html, /id="cline-auths-rows"/);
    assert.match(html, /class="auth-profiles"/);
    assert.match(html, /id="cline-auths-device-start"/);
    assert.match(html, /id="cline-auths-paste-save"/);
    assert.match(html, /Loading Cline profiles/);
    assert.match(html, /id="cline-auths-refresh"/);
    assert.doesNotMatch(html, /id="cline-auths-paste-details" style="display:none/);
    assert.doesNotMatch(html, /<table/);
  });
});

describe("admin auth card runtime helpers", () => {
  // The runtime helpers are concatenated into the page script. They reference
  // globals provided by the page (escapeHtml, parseJson, toast) and must define
  // the expected entrypoints plus the new usage-graph renderers.

  test("codex runtime defines card init + usage ring + refresh helpers", () => {
    const js = codexAuthsRuntimeHelpers();
    for (const needle of [
      "function initCodexAuths()",
      "async function loadCodexAuths()",
      "function renderCodexAuths()",
      "function codexProfileRow(",
      "function codexRingHtml(",
      "function codexUsageLane(",
      "function codexUsageCell(",
      "function refreshCodexUsage()",
      "function codexFmtCountdown(",
      "function codexResetLabel(",
      "autoLoadCodexUsage()",
      "data-renew",
      "/api/codex-auths/",
      "/renew",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    // Ring renderer emits an SVG circle with a stroke-dashoffset so the
    // percentage is actually drawn as a graph, not a static label.
    assert.match(js, /stroke-dashoffset/);
    // The new card row uses the auth-profile grid, not a <tr>.
    assert.match(js, /class="auth-profile"/);
  });

  test("cline runtime defines card init + usage ring + refresh helpers", () => {
    const js = clineAuthsRuntimeHelpers();
    for (const needle of [
      "function initClineAuths()",
      "async function loadClineAuths()",
      "function renderClineAuths()",
      "function clineProfileRow(",
      "function clineRingHtml(",
      "function clineUsageLane(",
      "function clineUsageCell(",
      "function refreshClineUsage()",
      "function clineFmtCountdown(",
      "function clineResetLabel(",
      "autoLoadClineUsage()",
      "data-cline-renew",
      "/api/cline-auths/",
      "/renew",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    assert.match(js, /stroke-dashoffset/);
    assert.match(js, /class="auth-profile"/);
  });
});
