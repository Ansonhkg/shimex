import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installCodexClient, planCodexInstall } from "../src/clients/codex/lifecycle.js";

describe("Codex managed app lifecycle", () => {
  test("plans app copy and writes managed profile only when applied", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-lifecycle-"));
    const sourceApp = join(root, "Codex.app");
    const managedApp = join(root, "Shimex.app");
    const runtimeHome = join(root, "runtime");
    const profileHome = join(root, "profile");
    await mkdir(join(sourceApp, "Contents"), { recursive: true });
    await writeFile(join(sourceApp, "Contents", "Info.plist"), plist("1.2.3", "456"));
    const config = testConfig({ sourceApp, managedApp, runtimeHome, profileHome });

    const dryRun = await planCodexInstall(config);
    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.sourceCodexApp.version, "1.2.3");
    assert.equal(dryRun.managedShimexApp.exists, false);

    const result = await installCodexClient(config, {
      apply: true,
      models: [{
        slug: "test-model",
        displayName: "Test Model",
        providerId: "test",
        upstreamModel: "test-upstream",
        contextWindow: 128000,
        inputModalities: ["text"],
      }],
    });
    assert.equal(result.applied, true);
    await stat(join(managedApp, "Contents", "Info.plist"));
    const catalog = JSON.parse(await readFile(join(runtimeHome, "codex-model-catalog.json"), "utf8"));
    assert.equal(catalog.models[0].slug, "test-model");
    const codexConfig = await readFile(join(profileHome, "config.toml"), "utf8");
    assert.match(codexConfig, /model = "test-model"/);
    assert.match(codexConfig, /model_provider = "shimex"/);
  });
});

function testConfig({ sourceApp, managedApp, runtimeHome, profileHome }) {
  return {
    runtime: {
      host: "127.0.0.1",
      port: 18765,
      home: runtimeHome,
    },
    codex: {
      sourceApp,
      managedAppName: "Shimex",
      managedAppPath: managedApp,
      profileHome,
      userDataDir: join(profileHome, "user-data"),
    },
    providers: [],
  };
}

function plist(version, build) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${build}</string>
</dict>
</plist>
`;
}
