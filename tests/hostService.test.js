import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapHostService, buildLaunchAgentPlist, HOST_SERVICE_LABEL, planHostService } from "../src/server/service.js";

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
