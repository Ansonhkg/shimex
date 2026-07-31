import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pairingCard, pairingRuntimeHelpers } from "../src/admin/pairingCard.js";
import { adminPage } from "../src/admin/page.js";

describe("Admin client command card", () => {
  test("renders create and copy controls in the reworked pairing shell", () => {
    const markup = pairingCard();

    assert.match(markup, /class="span-12 pairing-page"/);
    assert.match(markup, /class="pairing-card"/);
    assert.match(markup, /Create client command/);
    assert.match(markup, /Connection mode/);
    assert.match(markup, /Paired clients/);
    assert.match(markup, /Revoke all clients/);
    assert.match(markup, /Provider secrets stay on the host/);
    assert.match(markup, /id="pairing-copy"/);
    assert.match(markup, /aria-label="Copy command"/);
    assert.match(markup, /class="ghost pairing-copy"[^>]*><svg/);
    assert.match(markup, /id="pairing-code-expires"/);
    assert.match(markup, /pairing-mode-grid/);
    assert.match(markup, /pairing-command-box/);
  });

  test("builds, displays, and copies the curl setup command", () => {
    const runtime = pairingRuntimeHelpers();

    assert.match(runtime, /\/join\/setup\.sh\?c=/);
    assert.match(runtime, /curl -fsSL/);
    assert.match(runtime, /navigator\.clipboard\.writeText/);
    assert.match(runtime, /document\.execCommand\('copy'\)/);
    assert.match(runtime, /window\.setInterval\(loadPairing, 15000\)/);
    assert.match(runtime, /window\.confirm/);
    assert.match(runtime, /interrupt paired clients/);
    assert.match(runtime, /setModeButtons\(/);
  });

  test("admin page CSS styles the pairing shell", () => {
    const html = adminPage();
    assert.match(html, /\.pairing-page\s*\{/);
    assert.match(html, /\.pairing-mode-grid\s*\{/);
    assert.match(html, /\.pairing-command-box\s*\{/);
    assert.match(html, /\.pairing-security-note\s*\{/);
  });
});
