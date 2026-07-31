import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";

describe("admin config env editing", () => {
  test("renders a Vercel-style secret plane with hidden values by default", () => {
    const html = adminPage();
    assert.match(html, /data-config-tab="yml"/);
    assert.match(html, /data-config-tab="env"/);
    assert.match(html, /id="config-editor"/);
    assert.match(html, /id="env-plane"/);
    assert.match(html, /id="env-rows"/);
    assert.match(html, /Hide all values/);
    assert.match(html, /Add variable/);
    assert.match(html, /values hidden by default|Values stay hidden until revealed|values stay hidden/i);
    assert.match(html, /function parseEnvEntries\(/);
    assert.match(html, /function maskSecret\(/);
    assert.match(html, /function renderEnvPlane\(/);
    assert.match(html, /function saveEnv\(/);
    assert.match(html, /function loadConfig\(/);
    assert.match(html, /function saveConfig\(/);
    assert.match(html, /function validateConfig\(/);
    assert.match(html, /\/api\/env/);
    // raw editor remains available as advanced escape hatch
    assert.match(html, /Advanced: raw \.env editor/);
    assert.match(html, /id="env-editor"/);
  });
});
