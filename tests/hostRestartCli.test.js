import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("shimex host restart CLI", () => {
  test("documents and wires host restart", async () => {
    const source = await readFile(new URL("../src/cli/main.js", import.meta.url), "utf8");
    assert.match(source, /shimex host restart/);
    assert.match(source, /host restart\s+Restart the host backend/);
    assert.match(source, /async function runHostRestart\(/);
    assert.match(source, /restartHostService\(/);
    assert.match(source, /subcommand === "restart"/);
    assert.match(source, /usage: shimex host <up\|down\|restart\|code\|clients\|revoke\|revoke-all>/);
  });

  test("service layer exports restartHostService", async () => {
    const source = await readFile(new URL("../src/server/service.js", import.meta.url), "utf8");
    assert.match(source, /export async function restartHostService\(/);
    assert.match(source, /launchctl-kickstart/);
    assert.match(source, /backend-restart/);
  });
});
