import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readClineAuths,
  renameClineProfile,
  resolveClineProfileForSlug,
  upsertClineProfile,
  writeClineAuths,
} from "../src/providers/cline-pass/authStore.js";
import { discoverModels } from "../src/core/modelDiscovery.js";
import { generateCodexCatalog } from "../src/clients/codex/catalog.js";
import { handleProviderModelRequest } from "../src/providers/adapter.js";
import { createClineAuthRoutes } from "../src/server/clineAuthRoutes.js";

async function freshRoot() {
  return await mkdtemp(join(tmpdir(), "shimex-cline-auths-"));
}

async function seedProfiles(root, names) {
  const path = join(root, "cline-auths.json");
  const profiles = Object.fromEntries(names.map((name, i) => [name, {
    label: name,
    account_id: `cline_${name}_${i}`,
    email: `${name}@example.test`,
    access_token: `cline-token-${name}`,
    refresh_token: `refresh-${name}`,
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "cline",
    available: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  }]));
  await writeFile(path, JSON.stringify({ version: 1, default_profile: names[0] || "", profiles }, null, 2));
  return path;
}

describe("cline auth profiles", () => {
  test("upserts, renames, and resolves profile-scoped slugs", () => {
    let store = { profiles: {}, defaultProfile: "" };
    const added = upsertClineProfile(store, "partner", {
      accessToken: "workos:access",
      refreshToken: "refresh",
      expiresAt: 4070908800000,
      accountId: "acct_partner",
      email: "partner@example.test",
    });
    store = { profiles: added.profiles, defaultProfile: added.defaultProfile };
    assert.equal(store.defaultProfile, "partner");
    assert.equal(store.profiles.partner.accessToken, "access");
    assert.equal(store.profiles.partner.expiresAt, "2099-01-01T00:00:00.000Z");
    const renamed = renameClineProfile(store, "partner", "work");
    assert.equal(renamed.renamed, true);
    assert.equal(renamed.defaultProfile, "work");
    assert.equal(resolveClineProfileForSlug(renamed, "work-cline-pass-glm-5-2").modelSlugPart, "cline-pass-glm-5-2");
  });

  test("read/write round trip filters invalid profiles", async () => {
    const root = await freshRoot();
    const path = join(root, "cline-auths.json");
    await writeClineAuths(path, {
      defaultProfile: "ok",
      profiles: {
        ok: { name: "ok", label: "ok", accessToken: "tok", refreshToken: "ref", accountId: "acct", email: "a@example.test", expiresAt: "2099-01-01T00:00:00.000Z", available: true, createdAt: "x", updatedAt: "y" },
      },
    });
    const store = await readClineAuths(path);
    assert.equal(store.profiles.ok.accessToken, "tok");
    assert.equal(store.defaultProfile, "ok");
  });

  test("discovers default-profile and scoped Cline models", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal", "partner"]);
    const config = {
      runtime: { home: root, host: "127.0.0.1", port: 0 },
      providers: [{ id: "cline-pass", enabled: true, options: { auths_path: path } }],
    };
    const models = await discoverModels(config);
    assert.equal(models.length, 30);
    assert.ok(models.find((model) => model.slug === "cline-pass-glm-5-2" && model.profile === "personal"));
    assert.ok(models.find((model) => model.slug === "partner-cline-pass-glm-5-2" && model.displayName === "partner: GLM-5.2"));
    assert.equal(models.find((model) => model.slug === "partner-cline-pass-glm-5-2").accountId, "");
    const catalog = generateCodexCatalog(models);
    assert.equal(catalog.models.find((model) => model.slug === "partner-cline-pass-glm-5-2").display_name, "partner: GLM-5.2");
  });

  test("routes profile-scoped Cline model using profile token", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["personal", "partner"]);
    const calls = [];
    const config = {
      runtime: { home: root, host: "127.0.0.1", port: 0 },
      providers: [{ id: "cline-pass", enabled: true, options: { auths_path: path } }],
    };
    const result = await handleProviderModelRequest(config, "/v1/responses", { model: "partner-cline-pass-glm-5-2", input: "hi" }, {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ data: { id: "chatcmpl", choices: [{ message: { role: "assistant", content: "ok" } }] } }), { headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(result.status, 200);
    assert.equal(calls[0].init.headers.authorization, "Bearer workos:cline-token-partner");
    assert.equal(JSON.parse(calls[0].init.body).model, "cline-pass/glm-5.2");
    assert.equal(JSON.parse(result.body).model, "partner-cline-pass-glm-5-2");
  });
  test("usage route normalizes Cline plan limits and hides raw payload", async () => {
    const root = await freshRoot();
    const path = await seedProfiles(root, ["partner"]);
    const config = {
      runtime: { home: root, host: "127.0.0.1", port: 0 },
      providers: [{ id: "cline-pass", enabled: true, options: { auths_path: path } }],
    };
    const calls = [];
    const routes = createClineAuthRoutes(config);
    const result = await routes.route(new Request("http://shimex/api/cline-auths/partner/usage"), new URL("http://shimex/api/cline-auths/partner/usage"), {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({
          success: true,
          data: {
            limits: [
              { type: "five_hour", percentUsed: 0 },
              { type: "weekly", percentUsed: 65, resetsAt: "2026-07-06T16:55:42.400487132Z" },
              { type: "monthly", percentUsed: 32, resetsAt: "2026-07-29T16:55:42.402246668Z" },
            ],
          },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(result.status, 200);
    const payload = JSON.parse(result.body);
    assert.equal(payload.profile, "partner");
    assert.deepEqual(payload.limits.map((limit) => [limit.type, limit.label, limit.usedPercent, limit.remainingPercent]), [
      ["five_hour", "5h", 0, 100],
      ["weekly", "weekly", 65, 35],
      ["monthly", "monthly", 32, 68],
    ]);
    assert.equal(payload.limits[1].resetAtIso, "2026-07-06T16:55:42.400Z");
    assert.equal(calls[0].url, "https://api.cline.bot/api/v1/users/me/plan/usage-limits");
    assert.equal(calls[0].init.headers.authorization, "Bearer workos:cline-token-partner");
    assert.equal(JSON.stringify(payload).includes("success"), false);
    assert.equal(JSON.stringify(payload).includes("cline-token"), false);
  });


  test("renew route refreshes an expiring Cline profile and persists the new token", async () => {
    const root = await freshRoot();
    const path = join(root, "cline-auths.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      default_profile: "partner",
      profiles: {
        partner: {
          label: "partner",
          account_id: "old-account",
          email: "old@example.test",
          access_token: "old-token",
          refresh_token: "refresh-partner",
          expires_at: "2026-01-01T00:00:00.000Z",
          provider: "cline",
          available: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      },
    }, null, 2));
    const config = {
      runtime: { home: root, host: "127.0.0.1", port: 0 },
      providers: [{ id: "cline-pass", enabled: true, options: { auths_path: path } }],
    };
    const calls = [];
    const routes = createClineAuthRoutes(config);
    const result = await routes.route(new Request("http://shimex/api/cline-auths/partner/renew", { method: "POST" }), new URL("http://shimex/api/cline-auths/partner/renew"), {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({
          data: {
            accessToken: "new-access",
            refreshToken: "next-refresh",
            expiresAt: "2099-02-01T00:00:00.000Z",
            userInfo: { clineUserId: "new-account", email: "new@example.test" },
          },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(result.status, 200);
    assert.equal(calls[0].url, "https://api.cline.bot/api/v1/auth/refresh");
    assert.equal(JSON.parse(calls[0].init.body).refreshToken, "refresh-partner");
    const body = JSON.parse(result.body);
    assert.equal(body.renewed, true);
    assert.equal(body.profile.expiresAt, "2099-02-01T00:00:00.000Z");
    const store = await readClineAuths(path);
    assert.equal(store.profiles.partner.accessToken, "new-access");
    assert.equal(store.profiles.partner.refreshToken, "next-refresh");
    assert.equal(store.profiles.partner.accountId, "new-account");
  });

});
