import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGrokAuthRoutes } from "../src/server/grokAuthRoutes.js";

describe("Grok auth/usage routes", () => {
  test("reports disconnected when auth file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-grok-auth-"));
    const authPath = join(root, "missing-auth.json");
    const routes = createGrokAuthRoutes({
      providers: [{ id: "grok", options: { auth_path: authPath } }],
    });
    const result = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/grok-auth"),
    );
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.connected, false);
  });

  test("normalizes billing credits usage payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-grok-auth-"));
    const authPath = join(root, "auth.json");
    await writeFile(authPath, JSON.stringify({
      "https://auth.x.ai::test": {
        key: "test-token",
        email: "user@example.com",
        user_id: "u1",
        team_id: "t1",
        expires_at: "2099-01-01T00:00:00.000Z",
        oidc_issuer: "https://auth.x.ai",
        oidc_client_id: "client",
      },
    }, null, 2));

    const routes = createGrokAuthRoutes({
      providers: [{ id: "grok", options: { auth_path: authPath, billing_url: "https://example.test/billing?format=credits" } }],
    });

    const result = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/grok-auth/usage"),
      {
        fetch: async () => ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              config: {
                currentPeriod: {
                  type: "USAGE_PERIOD_TYPE_WEEKLY",
                  start: "2026-07-27T00:00:00.000Z",
                  end: "2026-08-03T00:00:00.000Z",
                },
                creditUsagePercent: 35,
                onDemandCap: { val: 0 },
                onDemandUsed: { val: 0 },
                prepaidBalance: { val: 0 },
                productUsage: [
                  { product: "GrokBuild", usagePercent: 34 },
                  { product: "GrokImagine", usagePercent: 1 },
                ],
                isUnifiedBillingUser: true,
              },
            });
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.connected, true);
    assert.equal(body.usage.usedPercent, 35);
    assert.equal(body.usage.remainingPercent, 65);
    assert.equal(body.usage.products[0].product, "GrokBuild");
    assert.equal(body.usage.products[0].remainingPercent, 66);
    assert.equal(body.session.email, "user@example.com");
  });
});
