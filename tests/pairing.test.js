import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
  authenticateClientToken,
  createPairingCode,
  listClients,
  parseDisplayCode,
  readPairingStore,
  redeemPairingCode,
  revokeClient,
  writePairingStore,
  writeModeStore,
  readModeStore,
  writeClientSession,
  readClientSession,
} from "../src/core/pairing.js";
import { authorizeRequest } from "../src/core/access.js";
import { createPairingRoutes } from "../src/server/pairingRoutes.js";
import { remoteGatewayConfig } from "../src/core/clientMode.js";
import { writeCodexProfile } from "../src/clients/codex/lifecycle.js";

const execFileAsync = promisify(execFile);

describe("Host/client pairing", () => {
  test("creates and redeems a one-time pairing code into a client token", async () => {
    const config = await testConfig();
    let store = await readPairingStore(config);
    const created = createPairingCode(store, {
      advertiseUrl: "http://100.64.1.2:5413",
      ttlMs: 60_000,
    });
    store = created.store;
    await writePairingStore(config, store);

    assert.match(created.displayCode, /@[0-9.]+:5413$/);
    assert.equal(parseDisplayCode(created.displayCode).gatewayUrl, "http://100.64.1.2:5413");

    const first = redeemPairingCode(store, created.displayCode, {
      clientLabel: "laptop",
      attemptKey: "client-a",
    });
    assert.equal(first.ok, true);
    assert.ok(first.session.clientToken.length >= 32);
    store = first.store;
    await writePairingStore(config, store);

    const second = redeemPairingCode(store, created.displayCode, {
      clientLabel: "other",
      attemptKey: "client-b",
    });
    assert.equal(second.ok, false);
    assert.equal(second.error, "code_used");

    const auth = authenticateClientToken(store, first.session.clientToken);
    assert.equal(auth.id, first.session.clientId);
    assert.deepEqual(auth.scopes, ["models:use", "catalog:read"]);

    const revoked = revokeClient(store, first.session.clientId);
    store = revoked.store;
    assert.equal(authenticateClientToken(store, first.session.clientToken), null);
    assert.equal(listClients(store).length, 0);
  });

  test("rate-limits repeated failed pairing attempts", async () => {
    const config = await testConfig();
    let store = await readPairingStore(config);
    const created = createPairingCode(store, { advertiseUrl: "http://127.0.0.1:5413" });
    store = created.store;
    for (let i = 0; i < 5; i += 1) {
      const result = redeemPairingCode(store, "ZZZZ-ZZZZ@127.0.0.1:5413", { attemptKey: "attacker" });
      assert.equal(result.ok, false);
      store = result.store;
    }
    const limited = redeemPairingCode(store, "ZZZZ-ZZZZ@127.0.0.1:5413", { attemptKey: "attacker" });
    assert.equal(limited.ok, false);
    assert.equal(limited.error, "rate_limited");
  });

  test("authorizeRequest allows local full access and scopes remote clients", () => {
    const local = authorizeRequest("/api/install", "POST", { local: true, client: null });
    assert.equal(local.ok, true);

    const remoteNoToken = authorizeRequest("/v1/models", "GET", { local: false, client: null, tokenPresent: false });
    assert.equal(remoteNoToken.ok, false);
    assert.equal(remoteNoToken.status, 401);

    const remoteModel = authorizeRequest("/v1/chat/completions", "POST", {
      local: false,
      client: { id: "c1", scopes: ["models:use", "catalog:read"] },
    });
    assert.equal(remoteModel.ok, true);

    const remoteAdmin = authorizeRequest("/api/install", "POST", {
      local: false,
      client: { id: "c1", scopes: ["models:use", "catalog:read"] },
    });
    assert.equal(remoteAdmin.ok, false);
    assert.equal(remoteAdmin.status, 403);
  });

  test("pairing HTTP routes issue tokens and persist client auth", async () => {
    const config = await testConfig(18771);
    await writeModeStore(config, "host");
    const routes = createPairingRoutes(config);
    const localRequest = {
      method: "POST",
      headers: { "content-type": "application/json" },
      socket: { remoteAddress: "127.0.0.1" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ advertiseUrl: "http://127.0.0.1:18771" }));
      },
    };
    const codeResult = await routes.route(localRequest, new URL("http://127.0.0.1/api/pair/code"));
    assert.equal(codeResult.status, 200);
    const codePayload = JSON.parse(codeResult.body);
    assert.ok(codePayload.displayCode);

    const pairRequest = {
      method: "POST",
      headers: { "content-type": "application/json" },
      socket: { remoteAddress: "100.64.1.9" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ displayCode: codePayload.displayCode, clientLabel: "test-client" }));
      },
    };
    const pairResult = await routes.route(pairRequest, new URL("http://127.0.0.1/api/pair"));
    assert.equal(pairResult.status, 200);
    const pairPayload = JSON.parse(pairResult.body);
    assert.ok(pairPayload.clientToken);

    const store = await readPairingStore(config);
    assert.ok(authenticateClientToken(store, pairPayload.clientToken));
    assert.equal(authenticateClientToken(store, "nope"), null);

    const mode = await readModeStore(config);
    assert.equal(mode.mode, "host");

    // Remote non-admin cannot hit host control endpoints.
    const remoteCreate = await routes.route({
      method: "POST",
      headers: { "content-type": "application/json" },
      socket: { remoteAddress: "100.64.1.9" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("{}");
      },
    }, new URL("http://127.0.0.1/api/pair/code"));
    assert.equal(remoteCreate.status, 403);
  });

  test("client session and remote profile use host gateway + client token", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-client-profile-"));
    const config = {
      runtime: {
        host: "127.0.0.1",
        port: 5413,
        home: join(root, "runtime"),
        publicUrl: "http://127.0.0.1:5413",
      },
      codex: {
        sourceApp: join(root, "missing-Codex.app"),
        managedAppName: "Shimex",
        managedAppPath: join(root, "Shimex.app"),
        profileHome: join(root, "profile"),
        userDataDir: join(root, "user-data"),
        webSearch: "cached",
        mcpServers: [],
        seedLocalAuth: true,
        localAuthKey: "local-default",
      },
      providers: [],
    };
    const session = {
      gatewayUrl: "http://100.64.9.9:5413",
      clientToken: "client-token-abc123",
      clientId: "client_1",
      scopes: ["models:use", "catalog:read"],
    };
    await writeClientSession(config, session);
    const saved = await readClientSession(config);
    assert.equal(saved.gatewayUrl, session.gatewayUrl);
    assert.equal(saved.clientToken, session.clientToken);

    const remoteConfig = remoteGatewayConfig(config, session);
    assert.equal(remoteConfig.runtime.publicUrl, session.gatewayUrl);
    assert.equal(remoteConfig.codex.localAuthKey, session.clientToken);
    assert.equal(remoteConfig.runtime.skipLocalServer, true);

    const profile = await writeCodexProfile(remoteConfig, [{
      slug: "host-model",
      displayName: "Host Model",
      providerId: "test",
      upstreamModel: "upstream",
      contextWindow: 1000,
      inputModalities: ["text"],
    }]);
    const codexConfig = await readFile(profile.configPath, "utf8");
    assert.match(codexConfig, /base_url = "http:\/\/100\.64\.9\.9:5413\/v1"/);
    assert.match(codexConfig, /env_key = "OPENAI_API_KEY"/);
    assert.doesNotMatch(codexConfig, /experimental_bearer_token/);
    const auth = JSON.parse(await readFile(profile.authPath, "utf8"));
    assert.equal(auth.OPENAI_API_KEY, "client-token-abc123");
  });
});

async function testConfig(port = 18765) {
  return {
    project: { name: "shimex", packageManager: "npm" },
    providers: [],
    runtime: {
      host: "127.0.0.1",
      port,
      home: await mkdtemp(join(tmpdir(), "shimex-pair-")),
      publicUrl: `http://127.0.0.1:${port}`,
    },
    codex: {
      sourceApp: "auto",
      managedAppName: "Shimex",
      managedAppPath: "~/Applications/Shimex.app",
      profileHome: "~/.shimex/codex-profile",
      userDataDir: "~/.shimex/codex-user-data",
      webSearch: "cached",
      mcpServers: [],
      seedLocalAuth: true,
      localAuthKey: "shimex-local-api-key",
    },
  };
}

describe("Advertise URL auto-detect", () => {
  test("resolveAdvertiseUrl prefers explicit override", async () => {
    const { resolveAdvertiseUrl } = await import("../src/core/network.js");
    const result = await resolveAdvertiseUrl({
      runtime: { port: 5413, publicUrl: "http://127.0.0.1:5413" },
    }, { url: "http://shimex-host.tailnet.example:5413" });
    assert.equal(result.url, "http://shimex-host.tailnet.example:5413");
    assert.equal(result.source, "explicit");
  });

  test("detectLanEndpoints returns private IPv4 candidates when available", async () => {
    const { detectLanEndpoints } = await import("../src/core/network.js");
    const endpoints = detectLanEndpoints(5413);
    assert.ok(Array.isArray(endpoints));
    for (const endpoint of endpoints) {
      assert.match(endpoint.url, /^http:\/\/.+:5413$/);
    }
  });
});


describe("Pairing share card", () => {
  test("writes an AirDrop-friendly invite file with the full display code", async () => {
    const { preparePairingShareCard, buildInviteUrl, buildInviteOneLiner } = await import("../src/core/share.js");
    const { buildJoinSetupScript } = await import("../src/server/joinSetup.js");
    const displayCode = "ABCD-EFGH@shimex-host.tailnet.example:5413";
    const advertiseUrl = "http://shimex-host.tailnet.example:5413";
    const inviteUrl = buildInviteUrl(advertiseUrl, displayCode);
    assert.equal(inviteUrl, "http://shimex-host.tailnet.example:5413/join?c=ABCD-EFGH");
    assert.match(buildInviteOneLiner(inviteUrl), /curl -fsSL 'http:\/\/shimex-host\.tailnet\.example:5413\/join\/setup\.sh\?c=ABCD-EFGH' \| bash/);
    const card = await preparePairingShareCard({
      displayCode,
      advertiseUrl,
      expiresAt: "2026-07-30T16:59:03.541Z",
      hostLabel: "shimex",
    });
    const text = await readFile(card.path, "utf8");
    assert.match(text, /Run this ONE command on the client:/);
    assert.match(text, /\/join\/setup\.sh\?c=ABCD-EFGH/);
    assert.match(text, /ABCD-EFGH@shimex-host\.tailnet\.example:5413/);
    const script = buildJoinSetupScript({
      gateway: advertiseUrl,
      token: "token123",
      clientId: "client_1",
    });
    assert.match(script, /client-session\.json/);
    assert.match(script, /EXISTING_SESSION_PATH/);
    assert.match(script, /EXISTING_GATEWAY/);
    assert.match(script, /Found local Codex\.app — using local copy \(no host transfer\)/);
    assert.match(script, /No local Codex\.app — transferring managed Shimex\.app from host/);
    assert.match(script, /\/api\/desktop\/shimex\.app\.tgz/);
    assert.match(script, /model_catalog_json/);
    assert.match(script, /env_key = "OPENAI_API_KEY"/);
    assert.doesNotMatch(script, /experimental_bearer_token/);
    assert.match(script, /Opening managed Shimex app/);
    assert.equal(script.includes("API key:  ${CLIENT_TOKEN}"), false);
  });

  test("join setup replaces a rejected saved token by redeeming the supplied code", async () => {
    const { buildJoinSetupScript } = await import("../src/server/joinSetup.js");
    const root = await mkdtemp(join(tmpdir(), "shimex-join-repair-"));
    const runtimeHome = join(root, "runtime");
    const profileHome = join(root, "profile");
    const userDataDir = join(root, "user-data");
    const managedApp = join(root, "Shimex.app");
    const fakeBin = join(root, "bin");
    await mkdir(join(managedApp, "Contents"), { recursive: true });
    await mkdir(runtimeHome, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(join(runtimeHome, "client-session.json"), JSON.stringify({
      gatewayUrl: "http://shimex-host.example.test:5413",
      clientToken: "revoked-client-token",
      clientId: "client_old",
    }));

    const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail
ARGS="$*"
if [[ "$ARGS" == *"/v1/models"* && "$ARGS" == *"%{http_code}"* ]]; then
  printf '401'
  exit 0
fi
if [[ "$ARGS" == *"/api/pair"* ]]; then
  printf '%s' '{"clientToken":"fresh-client-token","clientId":"client_new","gatewayUrl":"http://shimex-host.example.test:5413"}'
  exit 0
fi
if [[ "$ARGS" == *"/codex/model-catalog.json"* ]]; then
  OUT=""
  while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == "-o" ]]; then
      shift
      OUT="$1"
    fi
    shift || true
  done
  printf '%s' '{"models":[{"slug":"host-model"}]}' > "$OUT"
  exit 0
fi
echo "unexpected curl call" >&2
exit 2
`;
    await writeFile(join(fakeBin, "curl"), fakeCurl);
    await writeFile(join(fakeBin, "uname"), "#!/usr/bin/env bash\nprintf 'Linux\\n'\n");
    await chmod(join(fakeBin, "curl"), 0o755);
    await chmod(join(fakeBin, "uname"), 0o755);

    const scriptPath = join(root, "setup.sh");
    await writeFile(scriptPath, buildJoinSetupScript({
      gateway: "http://shimex-host.example.test:5413",
      code: "ABCD-EFGH",
    }));
    const { stdout } = await execFileAsync("bash", [scriptPath], {
      env: {
        ...process.env,
        HOME: join(root, "home"),
        PATH: `${fakeBin}:${process.env.PATH}`,
        SHIMEX_RUNTIME_HOME: runtimeHome,
        SHIMEX_PROFILE_HOME: profileHome,
        SHIMEX_USER_DATA_DIR: userDataDir,
        SHIMEX_MANAGED_APP: managedApp,
        SHIMEX_SOURCE_CODEX: join(root, "missing-Codex.app"),
      },
    });

    assert.match(stdout, /Saved client token is no longer accepted — pairing again/);
    const session = JSON.parse(await readFile(join(runtimeHome, "client-session.json"), "utf8"));
    assert.equal(session.clientToken, "fresh-client-token");
    assert.equal(session.clientId, "client_new");
    const auth = JSON.parse(await readFile(join(profileHome, "auth.json"), "utf8"));
    assert.equal(auth.OPENAI_API_KEY, "fresh-client-token");
  });
});


describe("Desktop app transfer auth", () => {
  test("desktop bundle download is allowed for paired model-use clients", () => {
    const allowed = authorizeRequest("/api/desktop/shimex.app.tgz", "GET", {
      local: false,
      client: { id: "c1", scopes: ["models:use", "catalog:read"] },
    });
    assert.equal(allowed.ok, true);

    const denied = authorizeRequest("/api/desktop/shimex.app.tgz", "GET", {
      local: false,
      client: null,
      tokenPresent: false,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 401);
  });
});
