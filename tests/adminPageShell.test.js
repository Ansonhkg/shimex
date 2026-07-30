import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminPage } from "../src/admin/page.js";

describe("admin page shell", () => {
  test("uses a left icon rail and removes Managed Codex app setup card", () => {
    const html = adminPage();

    assert.match(html, /class="sidebar"/);
    assert.match(html, /class="sidebar-nav"/);
    assert.match(html, /data-view="overview"/);
    assert.match(html, /data-view="models"/);
    assert.match(html, /data-view="pairing"/);
    assert.match(html, /data-view="codex"/);
    assert.match(html, /data-view="cline"/);
    assert.match(html, /id="panel-overview"/);
    assert.match(html, /id="panel-models"/);
    assert.match(html, /id="panel-pairing"/);
    assert.match(html, /id="panel-codex"/);
    assert.match(html, /id="panel-cline"/);
    assert.match(html, /function setView/);
    assert.match(html, /id="doctor"/);
    assert.match(html, /Endpoints/);
    assert.match(html, /id="pairing-card"/);
    assert.match(html, /id="codex-auths-panel"/);
    assert.match(html, /id="cline-auths-panel"/);

    assert.doesNotMatch(html, /Managed Codex app/);
    assert.doesNotMatch(html, /id="actions"/);
    assert.doesNotMatch(html, /renderActions/);
    assert.doesNotMatch(html, /Set up and open/);
    assert.doesNotMatch(html, /Update and open/);
  });
});
