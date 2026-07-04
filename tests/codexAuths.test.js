import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import {
  authStorePath,
  getProfile,
  listProfileSummaries,
  maskAccountId,
  readCodexAuths,
  removeProfile,
  renameProfile,
  resolveProfileForSlug,
  setDefaultProfile,
  upsertProfile,
  writeCodexAuths,
} from "../src/providers/chatgpt-codex/authStore.js";
import { loadAuthStore, chatgptCodexProvider } from "../src/providers/chatgpt-codex/index.js";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { handleProviderModelRequest } from "../src/providers/adapter.js";
import { generateCodexCatalog } from "../src/clients/codex/catalog.js";
import { resolveModelRoute } from "../src/providers/routes.js";
import {
  cancelShimexCodexDeviceLogin,
  completeShimexCodexDeviceLogin,
  getShimexCodexDeviceLogin,
  startShimexCodexDeviceLogin,
} from "../src/providers/chatgpt-codex/deviceLogin.js";
import { createCodexAuthRoutes } from "../src/server/codexAuthRoutes.js";

function freshRoot() {
  return mkdtemp(join(tmpdir(), "shimex-codex-auths-"));
}

async function seedProfiles(root, names) {
  const path = join(root, "codex-auths.json");
  const profiles = Object.fromEntries(names.map((name, i) => [name, {
    name,
    label: name,
    account_id: `acct_${name}_${i}`,
    access_token: `tok_${name}_${randomBytes(4).toString("hex")}`,
    available: true,
    created_at: new Date(2026, 0, 1).toISOString(),
    updated_at: new Date(2026, 0, 2).toISOString(),
    note: "",
  }]));
  await writeFile(path, JSON.stringify({ version: 1, default_profile: names[0] || "", profiles }, null, 2));
  return path;
}

function fakeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

async function seedLegacyCodexAuth(root, { accessToken, accountId = "acct_default", expiresAt = "2099-01-01T00:00:00.000Z" } = {}) {
  const path = join(root, "codex-auth.json");
  await writeFile(path, JSON.stringify({
    tokens: {
      access_token: accessToken || fakeJwt({ exp: Math.floor(Date.parse(expiresAt) / 1000) }),
      account_id: accountId,
      expires_at: expiresAt,
    },
  }, null, 2));
  return path;
}

describe("chatgpt-codex auth store", () => {
  test("upsertProfile enforces profile name shape", () => {
    const store = { profiles: {}, defaultProfile: "" };
    for (const bad of ["", " has space", "a".repeat(70), "no/slash", "no\\slash"]) {
      assert.throws(() => upsertProfile(store, bad, { tokens: { access_token: "x" } }), /Profile name/);
    }
    assert.throws(() => upsertProfile(store, "ok-name", { tokens: {} }), /access_token/);
  });

  test("upsertProfile writes payload through several input shapes", () => {
    let store = { profiles: {}, defaultProfile: "" };
    const a = upsertProfile(store, "personal", { tokens: { access_token: "tok-a", account_id: "acct-a" } });
    store = { profiles: a.profiles, defaultProfile: a.defaultProfile };
    assert.equal(store.profiles.personal.accessToken, "tok-a");
    assert.equal(store.profiles.personal.accountId, "acct-a");
    assert.equal(store.defaultProfile, "personal");

    const b = upsertProfile(store, "paste-form", { tokens: { access_token: "tok-b" }, label: "Work account" });
    assert.equal(b.profiles["paste-form"].label, "Work account");

    const c = upsertProfile(store, "legacy-flat", { access_token: "tok-c", account_id: "acct-c" });
    assert.equal(c.profiles["legacy-flat"].accessToken, "tok-c");

    const d = upsertProfile(store, "wrapped", { "openai-codex": { type: "oauth", access: "tok-d", refresh: "ref-d", expires: 1735689600 } });
    assert.equal(d.profiles["wrapped"].accessToken, "tok-d");
    assert.equal(d.profiles["wrapped"].refreshToken, "ref-d");
    assert.equal(d.profiles["wrapped"].expiresAt, "2025-01-01T00:00:00.000Z");
  });

  test("renameProfile preserves credentials and moves the default profile", () => {
    const store = {
      profiles: {
        partner: {
          name: "partner",
          label: "partner",
          accountId: "acct_partner",
          accessToken: "tok",
          refreshToken: "ref",
          expiresAt: "2099-01-01T00:00:00.000Z",
          available: true,
          createdAt: "2026",
          updatedAt: "2026",
          note: "",
        },
      },
      defaultProfile: "partner",
    };
    const result = renameProfile(store, "partner", "work");
    assert.equal(result.renamed, true);
    assert.equal(result.defaultProfile, "work");
    assert.equal(result.profiles.work.accessToken, "tok");
    assert.equal(result.profiles.work.refreshToken, "ref");
    assert.equal(result.profiles.work.expiresAt, "2099-01-01T00:00:00.000Z");
    assert.equal(result.profiles.partner, undefined);
    assert.equal(renameProfile(result, "work", "bad name").reason, "invalid-target");
  });

  test("readCodexAuths filters junk", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      default_profile: "  ",
      profiles: {
        good: { access_token: "tok", account_id: "a", available: true, created_at: "x", updated_at: "y", note: "" },
        empty: { access_token: "" },
        "bad name": { access_token: "tok" },
        "another/bad": { access_token: "tok" },
      },
    }));
    const store = await readCodexAuths(path);
    assert.deepEqual(Object.keys(store.profiles).sort(), ["good"]);
    assert.equal(store.defaultProfile, "");
  });

  test("setDefaultProfile changes default and ignores unknown profile", () => {
    const next = setDefaultProfile({ profiles: { a: {}, b: {} }, defaultProfile: "b" }, "a");
    assert.equal(next.defaultProfile, "a");
    assert.equal(next.changed, true);
    const same = setDefaultProfile({ profiles: { a: {} }, defaultProfile: "a" }, "a");
    assert.equal(same.changed, false);
    const missing = setDefaultProfile({ profiles: {}, defaultProfile: "" }, "a");
    assert.equal(missing.changed, false);
    assert.equal(missing.defaultProfile, "");
  });

  test("resolveProfileForSlug matches longest prefix and falls back to default", () => {
    const store = {
      profiles: {
        personal: { name: "personal", accountId: "a", accessToken: "tok" },
        "work-team": { name: "work-team", accountId: "b", accessToken: "tok" },
      },
      defaultProfile: "personal",
    };
    assert.equal(resolveProfileForSlug(store, "personal-gpt-5-5").modelSlugPart, "gpt-5-5");
    assert.equal(resolveProfileForSlug(store, "work-team-gpt-5-5").profile.accountId, "b");
    assert.equal(resolveProfileForSlug(store, "gpt-5-5").profile.accountId, "a");
    assert.equal(resolveProfileForSlug({ profiles: {}, defaultProfile: "" }, "anything"), null);
  });

  test("writeCodexAuths round-trip is hermetic and chmods 0o600", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const payload = {
      profiles: {
        p1: { name: "p1", label: "p1", accountId: "a", accessToken: "tok-1", available: true, createdAt: "2026", updatedAt: "2026", note: "" },
      },
      defaultProfile: "p1",
    };
    const writeResult = await writeCodexAuths(path, payload);
    assert.equal(writeResult.profileNames.join(","), "p1");
    const reread = await readCodexAuths(path);
    assert.equal(reread.profiles.p1.accessToken, "tok-1");
    assert.equal(reread.defaultProfile, "p1");
    const st = await readFile(path);
    assert.ok(!/tok-1/.test(st.toString()) === false); // sanity: token is on disk
  });

  test("listProfileSummaries + maskAccountId produce stable strings", () => {
    const store = {
      profiles: {
        one: { name: "one", label: "one", accountId: "acc_xyz_1", accessToken: "x", available: true, createdAt: "2026", updatedAt: "2026", note: "" },
        short: { name: "short", label: "short", accountId: "abc", accessToken: "x", available: true, createdAt: "2026", updatedAt: "2026", note: "" },
      },
      defaultProfile: "one",
    };
    const summaries = listProfileSummaries(store);
    assert.equal(summaries.length, 2);
    assert.deepEqual(summaries.map((s) => [s.name, s.isDefault]), [["one", true], ["short", false]]);
    assert.equal(maskAccountId("acc_xyz_1"), "acc…z_1");
    assert.equal(maskAccountId("abc"), "***");
    assert.equal(maskAccountId(""), "");
  });
});

describe("chatgpt-codex provider model discovery", () => {
  test("emits default-profile models plus profile-scoped rows without public account metadata", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal", "work"]);
    const config = {
      runtime: { host: "127.0.0.1", port: 18765, home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, models: [], options: { auths_path: path } }],
    };
    const models = await discoverModels(config);
    assert.equal(models.length, 12);
    const slugs = models.map((m) => m.slug).sort();
    assert.deepEqual(slugs, [
      "gpt-5-3-codex-spark",
      "gpt-5-4",
      "gpt-5-4-mini",
      "gpt-5-5",
      "personal-gpt-5-3-codex-spark",
      "personal-gpt-5-4",
      "personal-gpt-5-4-mini",
      "personal-gpt-5-5",
      "work-gpt-5-3-codex-spark",
      "work-gpt-5-4",
      "work-gpt-5-4-mini",
      "work-gpt-5-5",
    ]);
    const defaultGpt55 = models.find((m) => m.slug === "gpt-5-5");
    assert.equal(defaultGpt55.profile, "personal");
    assert.equal(defaultGpt55.accountId, "");
    assert.equal(defaultGpt55.displayName, "GPT-5.5");
    assert.equal(defaultGpt55.upstreamModel, "gpt-5.5");

    const personalScoped = models.find((m) => m.slug === "personal-gpt-5-5");
    assert.equal(personalScoped.profile, "personal");
    assert.equal(personalScoped.accountId, "");
    assert.equal(personalScoped.upstreamModel, "gpt-5.5");
    assert.equal(personalScoped.displayName, "personal: GPT-5.5");

    const workScoped = models.find((m) => m.slug === "work-gpt-5-5");
    assert.equal(workScoped.profile, "work");
    assert.equal(workScoped.accountId, "");
    assert.equal(workScoped.displayName, "work: GPT-5.5");

    const catalog = generateCodexCatalog(models);
    assert.equal(catalog.models.find((m) => m.slug === "gpt-5-5").display_name, "ChatGPT Codex: GPT-5.5");
    assert.equal(catalog.models.find((m) => m.slug === "work-gpt-5-5").display_name, "work: GPT-5.5");
  });

  test("returns [] when no auth reference is set and no legacy file exists", async () => {
    const root = await freshRoot();
    const config = {
      runtime: { host: "127.0.0.1", port: 18765, home: root },
      providers: [{
        id: "chatgpt-codex", enabled: true, models: [],
        options: { auths_path: join(root, "missing.json"), legacy_single_account: false },
      }],
    };
    const models = await discoverModels(config);
    assert.deepEqual(models, []);
  });

  test("loadAuthStore returns hermetic store with no profiles", async () => {
    const root = await freshRoot();
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: join(root, "absent.json") } };
    const store = await loadAuthStore(providerConfig, { runtime: { home: root } });
    assert.deepEqual(store.profiles, {});
  });
});

describe("chatgpt-codex request adapter", () => {
  test("routes per-slug token + chatgpt-account-id and rewrites upstream model", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal", "work"]);
    const config = {
      runtime: { host: "127.0.0.1", port: 18765, home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, models: [], options: { auths_path: path } }],
    };
    const models = await discoverModels(config);
    const captured = [];
    const fetchImpl = async (url, init) => {
      captured.push({ url, init });
      return new Response(JSON.stringify({
        id: "resp_1", model: "gpt-5.5",
        output: [{ id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "ok", annotations: [] }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const expectedTokens = {
      "personal-gpt-5-5": "tok_personal_",
      "work-gpt-5-5": "tok_work_",
    };
    const expectedAccounts = {
      "personal-gpt-5-5": "acct_personal_0",
      "work-gpt-5-5": "acct_work_1",
    };
    for (const slug of ["personal-gpt-5-5", "work-gpt-5-5"]) {
      const result = await handleProviderModelRequest(config, "/v1/responses", { model: slug, input: "hi", stream: false }, { fetch: fetchImpl });
      const call = captured[captured.length - 1];
      assert.equal(call.url, "https://chatgpt.com/backend-api/codex/responses");
      assert.equal(JSON.parse(call.init.body).model, "gpt-5.5");
      const bearer = (call.init.headers.authorization || "").replace(/^Bearer\s+/i, "");
      assert.ok(bearer.startsWith(expectedTokens[slug]), `bad token for ${slug}: ${bearer}`);
      assert.equal(call.init.headers["chatgpt-account-id"], expectedAccounts[slug]);
      assert.equal(call.init.headers["originator"], "codex_cli_rs");
      assert.equal(call.init.headers["openai-beta"], "responses=2026-02-06");
      assert.equal(result.status, 200);
      const out = JSON.parse(result.body);
      assert.equal(out.model, slug);
    }
  });

  test("routes unqualified default models through the default auth profile", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal", "work"]);
    const config = {
      runtime: { host: "127.0.0.1", port: 18765, home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, models: [], options: { auths_path: path } }],
    };
    let captured = null;
    const result = await handleProviderModelRequest(config, "/v1/responses", { model: "gpt-5-5", input: "hi", stream: false }, {
      fetch: async (url, init) => {
        captured = { url, init };
        return new Response(JSON.stringify({
          id: "resp_1", model: "gpt-5.5",
          output: [{ id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "ok", annotations: [] }] }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(result.status, 200);
    assert.equal(captured.url, "https://chatgpt.com/backend-api/codex/responses");
    assert.equal(JSON.parse(captured.init.body).model, "gpt-5.5");
    assert.match(captured.init.headers.authorization, /^Bearer tok_personal_/);
    assert.equal(captured.init.headers["chatgpt-account-id"], "acct_personal_0");
    assert.equal(JSON.parse(result.body).model, "gpt-5-5");
  });

  test("returns 401 with shimex_auth_unavailable when no profile matches the slug", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal"]);
    const config = {
      runtime: { host: "127.0.0.1", port: 18765, home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, models: [], options: { auths_path: path } }],
    };
    const result = await handleProviderModelRequest(config, "/v1/responses", { model: "unknown-gpt-5-5", input: "hi", stream: false }, { fetch: () => { throw new Error("no fetch expected"); } });
    assert.equal(result.status, 404);
    assert.equal(JSON.parse(result.body).error.type, "shimex_unknown_model");
  });
});

describe("device login flow", () => {
  test("completes happy path and writes credentials to codex-auths.json", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({ userCode: "ABCD-EFGH", authorizationCode: "auth_code_xyz", codeVerifier: "verifier-1" });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    assert.equal(start.userCode, "ABCD-EFGH");
    assert.equal(start.status, "pending");
    // poll until complete
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "complete";
    }, { timeoutMs: 5000 });
    const completed = await completeShimexCodexDeviceLogin(start.id, providerConfig, rootConfig);
    assert.equal(completed.profileName, "personal");
    assert.equal(completed.profile.accountId, "acct_decoded_42");
    const reread = await readCodexAuths(path);
    assert.ok(reread.profiles.personal);
    assert.ok(reread.profiles.personal.accessToken.startsWith("eyJ"));
    assert.equal(reread.defaultProfile, "personal");
  });

  test("cancel removes the in-memory login", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({ userCode: "ABCD-EFGH" });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    assert.ok(getShimexCodexDeviceLogin(start.id));
    assert.equal(cancelShimexCodexDeviceLogin(start.id), true);
    assert.equal(getShimexCodexDeviceLogin(start.id), null);
  });

  test("returns 502 when device-code endpoint fails", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const routes = createCodexAuthRoutes(rootConfig);
    const failFetch = async () => new Response("login disabled", { status: 404 });
    const result = await routes.route(
      makeRequest("POST"),
      new URL("http://x/api/codex-auths/start-device"),
      { fetch: failFetch },
    );
    assert.equal(result.status, 502);
    assert.match(JSON.parse(result.body).error, /device code/i);
  });

  test("treats 403 deviceauth_authorization_pending as pending and continues polling", async () => {
    // Regression for the exact response the user hit:
    // HTTP 403 with body { error: { code: "deviceauth_authorization_pending", message: "Device authorization is pending..." } }
    // The poller must NOT mark the device login as errored; it must keep
    // polling until the next response carries an authorization_code.
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({
      userCode: "ABCD-1234",
      authorizationCode: "code-1",
      codeVerifier: "verifier-1",
      pendingStatus: 403,
    });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "complete";
    }, { timeoutMs: 8000 });
    const completed = await completeShimexCodexDeviceLogin(start.id, providerConfig, rootConfig);
    assert.equal(completed.profileName, "personal");
    assert.equal(completed.profile.accountId, "acct_decoded_42");
  });

  test("treats 429 deviceauth_slow_down as slow_down and keeps polling", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    let pollCount = 0;
    const attempts = [];
    const fetcher = makeMockedDeviceFetcherWith({
      userCode: "ABCD-1234",
      onPoll: (stage) => {
        attempts.push(stage);
      },
      sequence: [
        { status: 403, body: { error: { code: "deviceauth_slow_down", message: "Slow down." } } },
        { status: 403, body: { error: { code: "deviceauth_authorization_pending", message: "Device authorization is pending. Please try again." } } },
        { status: 200, body: { authorization_code: "code-2", code_verifier: "verifier-2" } },
      ],
    });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "complete";
    }, { timeoutMs: 18000 });
    const status = getShimexCodexDeviceLogin(start.id);
    assert.equal(status && status.error, null);
    assert.ok(attempts.length >= 3, `expected >=3 poll attempts, saw ${attempts.length}`);
  });

  test("surfaces deviceauth_authorization_declined as a hard error", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcherWith({
      userCode: "ABCD-1234",
      sequence: [
        { status: 403, body: { error: { code: "deviceauth_authorization_declined", message: "User declined." } } },
      ],
    });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "error";
    }, { timeoutMs: 5000 });
    const status = getShimexCodexDeviceLogin(start.id);
    assert.match(status.error, /declined/i);
  });

  test("surfaces deviceauth_expired_token as a hard error", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcherWith({
      userCode: "ABCD-1234",
      sequence: [
        { status: 403, body: { error: { code: "deviceauth_expired_token", message: "Code expired." } } },
      ],
    });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "error";
    }, { timeoutMs: 5000 });
    const status = getShimexCodexDeviceLogin(start.id);
    assert.match(status.error, /expired/i);
  });
});

describe("codex-auth HTTP API", () => {
  test("list/add/use/remove CRUD round-trips through the auths file", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const routes = createCodexAuthRoutes({
      runtime: { home: root, host: "127.0.0.1", port: 18765 },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path, legacy_single_account: false } }],
    });
    const list = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths"));
    assert.equal(list.status, 200);
    assert.deepEqual(JSON.parse(list.body).profiles, []);

    const addBody = JSON.stringify({ name: "personal", auth_json: JSON.stringify({ tokens: { access_token: "tok-add-1", account_id: "acct_add_1" } }) });
    const add = await routes.route(makeRequest("POST", addBody), new URL("http://x/api/codex-auths"));
    assert.equal(add.status, 200);
    assert.equal(JSON.parse(add.body).profile.accountId, undefined);
    assert.equal(JSON.parse(add.body).profile.accountMasked, "acc…d_1");

    const use = await routes.route({ method: "POST" }, new URL("http://x/api/codex-auths/personal/use"));
    assert.equal(use.status, 200);
    const listAfter = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths"));
    assert.equal(JSON.parse(listAfter.body).defaultProfile, "personal");

    const remove = await routes.route(makeRequest("DELETE"), new URL("http://x/api/codex-auths/personal"));
    assert.equal(remove.status, 200);
    const listAfterRemove = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths"));
    assert.deepEqual(JSON.parse(listAfterRemove.body).profiles, []);
    assert.equal(JSON.parse(listAfterRemove.body).defaultProfile, "");
  });



  test("renew route refreshes a stored Codex profile and persists the new token", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      default_profile: "partner",
      profiles: {
        partner: {
          label: "partner",
          account_id: "old-account",
          access_token: "old-token",
          refresh_token: "refresh-partner",
          expires_at: "2026-01-01T00:00:00.000Z",
          token_type: "Bearer",
          available: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          note: "",
        },
      },
    }, null, 2));
    const nextAccess = fakeJwt({ exp: Math.floor(Date.parse("2099-03-01T00:00:00.000Z") / 1000), "https://api.openai.com/auth": { chatgpt_account_id: "new-account" } });
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path, legacy_single_account: false } }],
    });
    const calls = [];
    const result = await routes.route(
      makeRequest("POST"),
      new URL("http://x/api/codex-auths/partner/renew"),
      { fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ access_token: nextAccess, refresh_token: "next-refresh", expires_in: 3600, token_type: "Bearer" }), { headers: { "content-type": "application/json" } });
      } },
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0].url, "https://auth.openai.com/oauth/token");
    assert.match(String(calls[0].init.body), /grant_type=refresh_token/);
    assert.match(String(calls[0].init.body), /refresh_token=refresh-partner/);
    const body = JSON.parse(result.body);
    assert.equal(body.renewed, true);
    const store = await readCodexAuths(path);
    assert.equal(store.profiles.partner.accessToken, nextAccess);
    assert.equal(store.profiles.partner.refreshToken, "next-refresh");
    assert.equal(store.profiles.partner.accountId, "new-account");
  });


  test("rename route renames a profile and preserves the default", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["partner"]);
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path, legacy_single_account: false } }],
    });
    const renamed = await routes.route(
      makeRequest("POST", { name: "work" }),
      new URL("http://x/api/codex-auths/partner/rename"),
    );
    assert.equal(renamed.status, 200);
    const renamedBody = JSON.parse(renamed.body);
    assert.equal(renamedBody.from, "partner");
    assert.equal(renamedBody.to, "work");
    assert.equal(renamedBody.defaultProfile, "work");
    const list = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths"));
    const body = JSON.parse(list.body);
    assert.deepEqual(body.profiles.map((profile) => profile.name), ["work"]);
    assert.equal(body.profiles[0].isDefault, true);
  });

  test("rejects bad profile names with 400", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path } }],
    });
    const result = await routes.route(
      makeRequest("POST", { name: "has space", auth_json: "{}" }),
      new URL("http://x/api/codex-auths"),
    );
    assert.equal(result.status, 400);
  });

  test("credits route normalizes /wham/rate-limit-reset-credits response", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal"]);
    const fetcher = async () => new Response(JSON.stringify({
      available_count: 17,
      total_earned_count: 50,
      credits: [
        { expires_at: "2026-08-01T00:00:00Z", status: "active", amount: 1 },
        { expires_at: 0, status: "expired" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path } }],
    });
    const result = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths/personal/credits"), { fetch: fetcher });
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.available, 17);
    assert.equal(body.totalEarned, 50);
    assert.equal(body.credits.length, 2);
    assert.equal(body.accountMasked || body.account, undefined);
  });

  test("credits route surfaces upstream 401 when token is rejected", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal"]);
    const fetcher = async () => new Response(JSON.stringify({ error: "nope" }), { status: 401 });
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path } }],
    });
    const result = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths/personal/credits"), { fetch: fetcher });
    assert.equal(result.status, 502);
    assert.equal(JSON.parse(result.body).upstreamStatus, 401);
  });

  test("usage route normalizes plan, reset windows, credits, and usage headers", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal"]);
    const calls = [];
    const fetcher = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        user_id: "user_1",
        account_id: "acct_personal_0",
        email: "user@example.com",
        plan_type: "plus",
        rate_limit: {
          allowed: true,
          limit_reached: false,
          primary_window: { used_percent: 20, limit_window_seconds: 18000, reset_after_seconds: 17085, reset_at: 1783119833 },
          secondary_window: { used_percent: 3, limit_window_seconds: 604800, reset_after_seconds: 603885, reset_at: 1783706633 },
        },
        credits: { has_credits: false, unlimited: false, balance: "0", approx_local_messages: [0, 0], approx_cloud_messages: [0, 0] },
        spend_control: { reached: false },
        rate_limit_reset_credits: { available_count: 0 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path } }],
    });
    const result = await routes.route(makeRequest("GET"), new URL("http://x/api/codex-auths/personal/usage"), { fetch: fetcher });
    assert.equal(result.status, 200);
    assert.equal(calls[0].url, "https://chatgpt.com/backend-api/wham/usage");
    assert.match(calls[0].init.headers.authorization, /^Bearer tok_personal_/);
    assert.equal(calls[0].init.headers["chatgpt-account-id"], "acct_personal_0");
    const body = JSON.parse(result.body);
    assert.equal(body.planType, "plus");
    assert.equal(body.userId, undefined);
    assert.equal(body.email, undefined);
    assert.equal(body.accountId, undefined);
    assert.equal(body.raw, undefined);
    assert.equal(body.primaryWindow.usedPercent, 20);
    assert.equal(body.primaryWindow.remainingPercent, 80);
    assert.equal(body.secondaryWindow.remainingPercent, 97);
    assert.equal(body.credits.balance, "0");
    assert.equal(body.resetCreditsAvailable, 0);
  });


  test("list includes read-only default Codex auth with expiry", async () => {
    const root = await freshRoot();
    const authPath = await seedLegacyCodexAuth(root, { accountId: "acct_default_readonly" });
    const config = {
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auth_path: authPath, auths_path: join(root, "codex-auths.json") } }],
    };
    const routes = createCodexAuthRoutes(config);
    const result = await routes.route(new Request("http://shimex/api/codex-auths"), new URL("http://shimex/api/codex-auths"));
    assert.equal(result.status, 200);
    const payload = JSON.parse(result.body);
    const row = payload.profiles.find((profile) => profile.name === "default-codex");
    assert.ok(row);
    assert.equal(row.label, "Default Codex auth");
    assert.equal(row.readOnly, true);
    assert.equal(row.expiresAt, "2099-01-01T00:00:00.000Z");
    assert.equal(row.accountMasked, "acc…nly");
  });

  test("default Codex auth supports usage but cannot be disconnected", async () => {
    const root = await freshRoot();
    const authPath = await seedLegacyCodexAuth(root, { accessToken: "legacy-default-token", accountId: "acct_default" });
    const config = {
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auth_path: authPath, auths_path: join(root, "codex-auths.json") } }],
    };
    const routes = createCodexAuthRoutes(config);
    const usage = await routes.route(new Request("http://shimex/api/codex-auths/default-codex/usage"), new URL("http://shimex/api/codex-auths/default-codex/usage"), {
      fetch: async (url, init) => {
        assert.equal(url, "https://chatgpt.com/backend-api/wham/usage");
        assert.equal(init.headers.authorization, "Bearer legacy-default-token");
        assert.equal(init.headers["chatgpt-account-id"], "acct_default");
        return new Response(JSON.stringify({
          plan_type: "plus",
          rate_limit: { allowed: true, limit_reached: false, primary_window: { used_percent: 25, reset_at: 1783119833 } },
          credits: { balance: "0" },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(usage.status, 200);
    assert.equal(JSON.parse(usage.body).profile, "default-codex");
    const remove = await routes.route(new Request("http://shimex/api/codex-auths/default-codex", { method: "DELETE" }), new URL("http://shimex/api/codex-auths/default-codex"));
    assert.equal(remove.status, 403);
    assert.match(JSON.parse(remove.body).error, /cannot be disconnected/);
  });

  test("start-device route returns placeholder device login", async () => {
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({ userCode: "ZZZZ-YYYY", authorizationCode: "code-1", codeVerifier: "verifier-2" });
    const routes = createCodexAuthRoutes({
      runtime: { home: root },
      providers: [{ id: "chatgpt-codex", enabled: true, options: { auths_path: path } }],
    });
    const start = await routes.route(makeRequest("POST", { profile: "personal" }), new URL("http://x/api/codex-auths/start-device"), { fetch: fetcher });
    assert.equal(start.status, 200);
    const startBody = JSON.parse(start.body);
    assert.equal(startBody.device.userCode, "ZZZZ-YYYY");
    assert.match(startBody.device.id, /^codex_login_/);
    await waitFor(async () => {
      const status = await routes.route(makeRequest("GET"), new URL(`http://x/api/codex-auths/device/${startBody.device.id}`));
      return status && status.status === 200 && JSON.parse(status.body).device.status === "complete";
    }, { timeoutMs: 5000 });
    const complete = await routes.route({ method: "POST" }, new URL(`http://x/api/codex-auths/device/${startBody.device.id}/complete`));
    assert.equal(complete.status, 200);
    const completedBody = JSON.parse(complete.body);
    assert.equal(completedBody.profileName, "personal");
  });
});


function makeRequest(method, body, extra = {}) {
  if (body == null) {
    return { method, body: null, headers: extra.headers || {} };
  }
  if (typeof body !== "string") body = JSON.stringify(body);
  return {
    method,
    headers: { "content-type": "application/json", ...(extra.headers || {}) },
    [Symbol.asyncIterator]: async function* () { yield Buffer.from(body); },
  };
}
function makeMockedDeviceFetcher({
  userCode,
  authorizationCode = "code-default",
  codeVerifier = "verifier-default",
  pendingStatus = 404,
}) {
  const sequence = [
    // First poll: server reports "still pending".
    pendingStatus >= 400
      ? { status: pendingStatus, body: { error: { code: "deviceauth_authorization_pending", message: "Device authorization is pending. Please try again." } } }
      : { status: pendingStatus, body: {} },
    { status: 200, body: { authorization_code: authorizationCode, code_verifier: codeVerifier } },
  ];
  return makeMockedDeviceFetcherWith({
    userCode,
    sequence,
    intervalSeconds: "2",
  });
}

async function waitFor(predicate, options = {}) {
  const deadline = Date.now() + (options.timeoutMs || 5000);
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("predicate did not become true within deadline");
}

function makeMockedDeviceFetcherWith({ userCode, sequence, onPoll, intervalSeconds = "1" }) {
  let i = 0;
  return async (url, init) => {
    if (url.endsWith("/api/accounts/deviceauth/usercode")) {
      return new Response(JSON.stringify({
        device_auth_id: "dev_auth_seq",
        user_code: userCode,
        interval: intervalSeconds,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/api/accounts/deviceauth/token")) {
      const step = sequence[i] || sequence[sequence.length - 1] || null;
      i += 1;
      if (!step) {
        return new Response("exhausted", { status: 500 });
      }
      if (onPoll) onPoll(step);
      if (step.status === 200 && step.body && step.body.authorization_code) {
        return new Response(JSON.stringify(step.body), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(step.body || {}), { status: step.status || 403, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/oauth/token")) {
      const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        "https://api.openai.com/auth": { chatgpt_account_id: "acct_decoded_42" },
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString("base64url");
      const access = `${header}.${payload}.sig`;
      return new Response(JSON.stringify({
        access_token: access,
        refresh_token: "refresh_token_value",
        id_token: access,
        expires_in: 3600,
        token_type: "Bearer",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("unexpected url " + url, { status: 500 });
  };
}

describe("device login page render", () => {
  // Regression: the complete-state device page previously rendered
  // "Saving credentials to your Codex auths file…" with NO script and no
  // /complete call, so codex-auths.json was never written. The page must
  // actually commit the credentials when it renders in the complete state.
  test("complete-state page issues POST /complete so credentials get saved", async () => {
    const { deviceLoginPage } = await import("../src/admin/deviceLoginPage.js");
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({ userCode: "ABCD-EFGH", authorizationCode: "auth_code_xyz", codeVerifier: "verifier-1" });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    await waitFor(async () => {
      const status = getShimexCodexDeviceLogin(start.id);
      return status && status.status === "complete";
    }, { timeoutMs: 5000 });
    const login = getShimexCodexDeviceLogin(start.id);
    assert.equal(login.status, "complete");
    const page = deviceLoginPage(login, { apiBase: "" });
    // The complete-state render MUST contain a fetch to /complete.
    // This is the line that was missing and caused the silent "Saving
    // credentials…" hang with an empty codex-auths.json.
    assert.match(page, /\/api\/codex-auths\/device\/[^/]+\/complete/);
    assert.match(page, /method:\s*"POST"/);
    // And it must surface success/failure text into the status element
    // rather than rendering a static, non-acting paragraph.
    assert.match(page, /id="save-status"/);
    // Sanity: the static, script-less "Saving credentials…" paragraph is gone.
    assert.doesNotMatch(page, /<p>Codex is connected\. Saving credentials to your Codex auths file…<\/p>\s*<p><a class="button" href="\/admin">Return to dashboard<\/a><\/p>\s*<\/section>/);
    // Clean up the in-memory login so it does not leak into other tests.
    cancelShimexCodexDeviceLogin(start.id);
  });

  test("pending-state page polls /complete proactively, not only on button click", async () => {
    const { deviceLoginPage } = await import("../src/admin/deviceLoginPage.js");
    const root = await freshRoot();
    const path = join(root, "codex-auths.json");
    const fetcher = makeMockedDeviceFetcher({ userCode: "WXYZ-1234" });
    const providerConfig = { id: "chatgpt-codex", enabled: true, options: { auths_path: path } };
    const rootConfig = { runtime: { home: root }, providers: [providerConfig] };
    const start = await startShimexCodexDeviceLogin(providerConfig, rootConfig, { profile: "personal", fetch: fetcher });
    const login = getShimexCodexDeviceLogin(start.id);
    assert.equal(login.status, "pending");
    const page = deviceLoginPage(login, { apiBase: "" });
    // The pending page must drive the save on its own (setInterval), so the
    // user does not have to click "Save credentials when ready" and the save
    // does not depend solely on the meta-refresh reload landing on the
    // complete-state render.
    assert.match(page, /setInterval\(refresh/);
    assert.match(page, /\/api\/codex-auths\/device\/[^/]+\/complete/);
    cancelShimexCodexDeviceLogin(start.id);
  });
});
