import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { handleProviderModelRequest } from "../src/providers/adapter.js";

describe("legacy single-account backward compatibility", () => {
  test("discoverModels falls back to ~/.codex/auth.json when no multi-account file", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-legacy-"));
    const authPath = join(root, "auth.json");
    await writeFile(authPath, JSON.stringify({
      tokens: { access_token: "fake-legacy-token", account_id: "legacy_acc" },
    }));
    const config = {
      runtime: { home: join(root, "no-such-dir"), host: "127.0.0.1", port: 18765 },
      providers: [{
        id: "chatgpt-codex", enabled: true, models: [],
        options: { auth_path: authPath, legacy_single_account: true },
      }],
    };
    const models = await discoverModels(config);
    assert.equal(models.length, 4);
    assert.deepEqual(models.map((m) => m.slug), ["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-5-3-codex-spark"]);
  });

  test("discoverModels ignores ~/.codex/auth.json when legacy_single_account is false", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-legacy-"));
    const authPath = join(root, "auth.json");
    await writeFile(authPath, JSON.stringify({
      tokens: { access_token: "fake-legacy-token", account_id: "legacy_acc" },
    }));
    const config = {
      runtime: { home: join(root, "no-such-dir"), host: "127.0.0.1", port: 18765 },
      providers: [{
        id: "chatgpt-codex", enabled: true, models: [],
        options: { auth_path: authPath, legacy_single_account: false },
      }],
    };
    const models = await discoverModels(config);
    assert.deepEqual(models, []);
  });

  test("adapter routes legacy single-account requests with the right token", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-legacy-"));
    const authPath = join(root, "auth.json");
    await writeFile(authPath, JSON.stringify({
      tokens: { access_token: "fake-legacy-token-abcdef", account_id: "legacy_acc_xyz" },
    }));
    const config = {
      runtime: { home: join(root, "no-such-dir"), host: "127.0.0.1", port: 18765 },
      providers: [{
        id: "chatgpt-codex", enabled: true, models: [],
        options: { auth_path: authPath, legacy_single_account: true },
      }],
    };
    let captured = null;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        id: "resp_1", model: "gpt-5.5",
        output: [{ id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const result = await handleProviderModelRequest(
      config, "/v1/responses", { model: "gpt-5-5", input: "hi", stream: false },
      { fetch: fetchImpl, authPath },
    );
    assert.equal(result.status, 200);
    assert.match(captured.init.headers.authorization, /Bearer fake-legacy-token/);
    assert.equal(captured.init.headers["chatgpt-account-id"], "legacy_acc_xyz");
  });
});
