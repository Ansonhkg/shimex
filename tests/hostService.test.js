import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapHostService, buildLaunchAgentPlist, HOST_SERVICE_LABEL, planHostService, restartHostService } from "../src/server/service.js";

describe("Persistent Shimex host service", () => {
  test("plans a user LaunchAgent without touching the original Codex app", () => {
    const config = testConfig();
    const plan = planHostService(config, {
      home: "/Users/tester",
      uid: 501,
      nodePath: "/opt/homebrew/bin/node",
      projectRoot: "/Users/tester/Projects/shimex",
    });

    assert.equal(plan.label, HOST_SERVICE_LABEL);
    assert.equal(plan.target, `gui/501/${HOST_SERVICE_LABEL}`);
    assert.equal(plan.plistPath, `/Users/tester/Library/LaunchAgents/${HOST_SERVICE_LABEL}.plist`);
    assert.equal(plan.adminUrl, "http://127.0.0.1:5413/admin");
    assert.equal(plan.originalCodexUntouched, true);
  });

  test("generates a keep-alive launchd job for the foreground gateway", () => {
    const plan = planHostService(testConfig(), {
      home: "/Users/tester",
      uid: 501,
      nodePath: "/opt/homebrew/bin/node",
      projectRoot: "/Users/tester/Projects/shimex",
    });
    const plist = buildLaunchAgentPlist(plan, { path: "/opt/homebrew/bin:/usr/bin:/bin" });

    assert.match(plist, new RegExp(`<string>${HOST_SERVICE_LABEL}</string>`));
    assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
    assert.match(plist, /<string>\/Users\/tester\/Projects\/shimex\/src\/cli\/main\.js<\/string>/);
    assert.match(plist, /<string>server<\/string>\s+<string>start<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key>\s+<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s+<true\/>/);
    assert.match(plist, /<key>SHIMEX_SERVICE_MANAGED<\/key>/);
    assert.doesNotMatch(plist, /Applications\/Codex\.app/);
  });

  test("retries launchd bootstrap while an old job is being released", async () => {
    const plan = planHostService(testConfig(), {
      home: "/Users/tester",
      uid: 501,
      nodePath: "/opt/homebrew/bin/node",
      projectRoot: "/Users/tester/Projects/shimex",
    });
    const calls = [];
    let bootstrapAttempts = 0;
    const run = async (_command, args) => {
      calls.push(args);
      if (args[0] === "bootstrap") {
        bootstrapAttempts += 1;
        if (bootstrapAttempts < 3) {
          throw new Error("Bootstrap failed: 5: Input/output error");
        }
      }
      return { code: 0 };
    };

    await bootstrapHostService(plan, {
      run,
      bootstrapAttempts: 3,
      bootstrapDelayMs: 0,
    });

    assert.equal(bootstrapAttempts, 3);
    assert.deepEqual(calls.at(-2), ["enable", plan.target]);
    assert.deepEqual(calls.at(-1), ["kickstart", "-k", plan.target]);
  });

  test("restartHostService kickstarts a loaded LaunchAgent", async () => {
    const config = testConfig();
    const calls = [];
    const originalFetch = globalThis.fetch;
    let healthChecks = 0;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/health")) {
        healthChecks += 1;
        return {
          ok: true,
          async json() {
            return { ok: true, service: "shimex" };
          },
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    try {
      const result = await restartHostService(config, {
        home: "/Users/tester",
        uid: 501,
        nodePath: "/opt/homebrew/bin/node",
        projectRoot: "/Users/tester/Projects/shimex",
        platform: "darwin",
        run: async (_command, args) => {
          calls.push(args);
          if (args[0] === "print") return { code: 0 };
          if (args[0] === "kickstart") return { code: 0 };
          throw new Error(`unexpected launchctl ${args.join(" ")}`);
        },
      });
      assert.equal(result.restarted, true);
      assert.equal(result.method, "launchctl-kickstart");
      assert.equal(result.health.ok, true);
      assert.deepEqual(calls[0], ["print", `gui/501/${HOST_SERVICE_LABEL}`]);
      assert.deepEqual(calls[1], ["kickstart", "-k", `gui/501/${HOST_SERVICE_LABEL}`]);
      assert.ok(healthChecks >= 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("restartHostService falls back to backend restart when service is not loaded", async () => {
    const config = testConfig();
    const calls = [];
    const originalFetch = globalThis.fetch;
    let healthChecks = 0;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/health")) {
        healthChecks += 1;
        // first status health false-ish path; waitForHealthy should eventually pass
        return {
          ok: healthChecks > 1,
          status: healthChecks > 1 ? 200 : 503,
          async json() {
            return healthChecks > 1
              ? { ok: true, service: "shimex" }
              : { ok: false, service: "shimex" };
          },
        };
      }
      if (String(url).endsWith("/api/stop")) {
        return {
          ok: true,
          async json() {
            return { ok: true };
          },
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    try {
      const result = await restartHostService(config, {
        home: "/Users/tester",
        uid: 501,
        nodePath: "/opt/homebrew/bin/node",
        projectRoot: "/Users/tester/Projects/shimex",
        platform: "darwin",
        healthAttempts: 5,
        healthDelayMs: 0,
        run: async (_command, args) => {
          calls.push(args);
          if (args[0] === "print") {
            throw new Error("not loaded");
          }
          throw new Error(`unexpected launchctl ${args.join(" ")}`);
        },
      });
      assert.equal(result.restarted, true);
      assert.equal(result.method, "backend-restart");
      assert.equal(result.service.loaded, false);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], ["print", `gui/501/${HOST_SERVICE_LABEL}`]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function testConfig() {
  return {
    runtime: {
      host: "0.0.0.0",
      port: 5413,
      home: "/Users/tester/.shimex",
      publicUrl: "http://shimex-host.tailnet.example:5413",
    },
    codex: {},
    providers: [],
  };
}
