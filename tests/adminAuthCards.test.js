import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { codexAuthsCard, codexAuthsRuntimeHelpers } from "../src/admin/codexAuthsCard.js";
import { clineAuthsCard, clineAuthsRuntimeHelpers } from "../src/admin/clineAuthsCard.js";
import { grokAuthsCard, grokAuthsRuntimeHelpers } from "../src/admin/grokAuthsCard.js";
import { cursorAuthsCard, cursorAuthsRuntimeHelpers } from "../src/admin/cursorAuthsCard.js";
import { adminPage } from "../src/admin/page.js";

describe("admin auth card markup", () => {
  test("codexAuthsCard uses shared auth-page shell with sign-in and paste affordances", () => {
    const html = codexAuthsCard();
    assert.match(html, /class="auth-page span-12"/);
    assert.match(html, /class="auth-shell"/);
    assert.match(html, /id="codex-auths-panel"/);
    assert.match(html, /id="codex-auths-title"/);
    assert.match(html, /id="codex-auths-rows"/);
    assert.match(html, /class="auth-profiles"/);
    assert.match(html, /class="auth-signin"/);
    assert.match(html, /id="codex-auths-device-start"/);
    assert.match(html, /id="codex-auths-paste-save"/);
    assert.match(html, /Loading Codex profiles/);
    assert.match(html, /id="codex-auths-refresh"/);
    assert.doesNotMatch(html, /id="codex-auths-actions" style="display:none"/);
    assert.doesNotMatch(html, /id="codex-auths-paste-details" style="display:none/);
    assert.doesNotMatch(html, /<table/);
    // Page title lives in the topbar; card should not restate a giant H2.
    assert.doesNotMatch(html, /<h2 id="codex-auths-title"/);
  });

  test("clineAuthsCard mirrors the shared auth-page structure", () => {
    const html = clineAuthsCard();
    assert.match(html, /class="auth-page span-12"/);
    assert.match(html, /class="auth-shell"/);
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

  test("grokAuthsCard uses the same shell language", () => {
    const html = grokAuthsCard();
    assert.match(html, /class="auth-page span-12"/);
    assert.match(html, /class="auth-shell"/);
    assert.match(html, /id="grok-auths-panel"/);
    assert.match(html, /id="grok-auths-title"/);
    assert.match(html, /id="grok-auths-rows"/);
    assert.match(html, /class="auth-signin"/);
    assert.match(html, /id="grok-auths-refresh"/);
    assert.match(html, /id="grok-auths-open-billing"/);
    assert.doesNotMatch(html, /<h2 id="grok-auths-title"/);
  });

  test("cursorAuthsCard provides a browser login action", () => {
    const html = cursorAuthsCard();
    assert.match(html, /class="auth-page span-12"/);
    assert.match(html, /class="auth-shell"/);
    assert.match(html, /id="cursor-auths-panel"/);
    assert.match(html, /id="cursor-auths-title"/);
    assert.match(html, /id="cursor-auths-rows"/);
    assert.match(html, /id="cursor-auths-login"/);
    assert.match(html, /Sign in with Cursor/);
    assert.match(html, /Cursor Agent/);
    assert.match(html, /credentials stay in Cursor/);
    assert.match(html, /id="cursor-auths-refresh"/);
    assert.doesNotMatch(html, /<table/);
  });

  test("admin page CSS defines shared auth shell layout", () => {
    const html = adminPage();
    assert.match(html, /\.auth-shell\s*,\s*\.auth-panel\s*\{/);
    assert.match(html, /\.auth-toolbar\s*,\s*\.auth-panel \.head\s*\{/);
    assert.match(html, /\.auth-signin\s*\{/);
    assert.match(html, /grid-template-columns:\s*minmax\(160px, 200px\) minmax\(0, 1fr\) minmax\(180px, 220px\)/);
  });
});

describe("admin auth card runtime helpers", () => {
  test("codex runtime defines card init + usage ring + refresh helpers", () => {
    const js = codexAuthsRuntimeHelpers();
    for (const needle of [
      "function initCodexAuths()",
      "async function loadCodexAuths()",
      "function renderCodexAuths()",
      "function codexProfileRow(",
      "function codexRingHtml(",
      "function codexUsageColor(",
      "function codexUsageLane(",
      "function codexUsageCell(",
      "function codexResetCreditsHtml(",
      "function refreshCodexUsage()",
      "function codexFmtCountdown(",
      "function codexResetLabel(",
      "autoLoadCodexUsage()",
      "data-renew",
      "/api/codex-auths/",
      "/credits",
      "/renew",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    assert.match(js, /stroke-dashoffset/);
    assert.match(js, /% remaining/);
    assert.match(js, /return 'var\(--ok\)'/);
    assert.doesNotMatch(js, /codexUsageLane\([^\\n]+color,/);
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
      "function clineUsageColor(",
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
    assert.match(js, /% remaining/);
    assert.match(js, /return 'var\(--ok\)'/);
    assert.doesNotMatch(js, /#9F57FA/);
    assert.doesNotMatch(js, /clineUsageLane\([^\\n]+color,/);
    assert.match(js, /class="auth-profile"/);
  });

  test("grok runtime still renders profile + usage helpers", () => {
    const js = grokAuthsRuntimeHelpers();
    for (const needle of [
      "function initGrokAuths()",
      "function renderGrokAuths()",
      "function grokProfileRow(",
      "function grokUsageLane(",
      "function refreshGrokUsage()",
      "/api/grok-auth",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    assert.match(js, /class="auth-profile"/);
  });

  test("cursor runtime defines browser login and polling helpers", () => {
    const js = cursorAuthsRuntimeHelpers();
    for (const needle of [
      "function initCursorAuths()",
      "async function loadCursorAuths()",
      "async function startCursorLogin()",
      "async function pollCursorLogin(",
      "/api/cursor-auth",
      "/api/cursor-auth/login/",
      "Sign in with Cursor",
      "Finish the Cursor login in your browser",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
  });
});
