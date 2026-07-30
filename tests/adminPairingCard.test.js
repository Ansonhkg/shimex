import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pairingCard, pairingRuntimeHelpers } from "../src/admin/pairingCard.js";

describe("Admin client command card", () => {
  test("renders create and copy controls", () => {
    const markup = pairingCard();

    assert.match(markup, /Create client command/);
    assert.match(markup, /id="pairing-copy"/);
    assert.match(markup, /one-time command/);
    assert.match(markup, /expires after five minutes/);
  });

  test("builds, displays, and copies the curl setup command", () => {
    const runtime = pairingRuntimeHelpers();

    assert.match(runtime, /\/join\/setup\.sh\?c=/);
    assert.match(runtime, /curl -fsSL/);
    assert.match(runtime, /navigator\.clipboard\.writeText/);
    assert.match(runtime, /document\.execCommand\('copy'\)/);
    assert.match(runtime, /window\.setInterval\(loadPairing, 15000\)/);
  });
});
