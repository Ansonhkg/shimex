import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clearServerPid, serverPaths, serverStatus, stopServer, writeServerPid } from "../src/server/process.js";

describe("Shimex server process lifecycle", () => {
  test("records and clears server pid metadata", async () => {
    const config = await testConfig();
    const paths = serverPaths(config);

    await writeServerPid(config, process.pid, { mode: "test" });

    const pidFile = JSON.parse(await readFile(paths.pidPath, "utf8"));
    assert.equal(pidFile.pid, process.pid);
    assert.equal(pidFile.mode, "test");

    const status = await serverStatus(config);
    assert.equal(status.pid, process.pid);
    assert.equal(status.pidAlive, true);
    assert.equal(status.running, false);
    assert.equal(status.pidPath, paths.pidPath);
    assert.equal(status.logPath, paths.logPath);

    assert.equal(await clearServerPid(config, process.pid), true);
    const cleared = await serverStatus(config);
    assert.equal(cleared.pid, null);
  });

  test("stop is a no-op when no server is running", async () => {
    const result = await stopServer(await testConfig());
    assert.equal(result.stopped, false);
    assert.equal(result.reason, "server-not-running");
  });

  test("stops a running server through the local stop endpoint when pid is missing", async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    let healthChecks = 0;
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      if (String(url).endsWith("/api/stop")) {
        return jsonResponse({ ok: true });
      }
      healthChecks += 1;
      return healthChecks === 1
        ? jsonResponse({ ok: true, service: "shimex" })
        : jsonResponse({ ok: false, service: "shimex" }, 503);
    };
    try {
      const result = await stopServer(await testConfig());
      assert.equal(result.stopped, true);
      assert.equal(result.method, "http");
      assert.equal(result.reason, "pid-missing");
      assert.deepEqual(requests, [
        "http://127.0.0.1:19655/health",
        "http://127.0.0.1:19655/api/stop",
        "http://127.0.0.1:19655/health",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

async function testConfig(port = 19655) {
  return {
    providers: [],
    runtime: {
      host: "127.0.0.1",
      port,
      home: await mkdtemp(join(tmpdir(), "shimex-server-test-")),
    },
    codex: {
      sourceApp: "auto",
      managedAppName: "Shimex",
      managedAppPath: "~/Applications/Shimex.app",
      profileHome: "~/.shimex/codex-profile",
      userDataDir: "~/.shimex/codex-user-data",
    },
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}
