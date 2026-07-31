import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";

describe("admin overview subscription usage", () => {
  test("renders overview usage strip for Codex, Cline, and Grok", () => {
    const html = adminPage();
    assert.match(html, /Subscription usage/);
    assert.match(html, /id="usage-overview"/);
    assert.match(html, /function loadOverviewUsage\(/);
    assert.match(html, /function summarizeCodexUsage\(/);
    assert.match(html, /function summarizeClineUsage\(/);
    assert.match(html, /function summarizeGrokUsage\(/);
    assert.match(html, /\/api\/codex-auths\//);
    assert.match(html, /\/api\/cline-auths\//);
    assert.match(html, /\/api\/grok-auth\/usage/);
  });
});
