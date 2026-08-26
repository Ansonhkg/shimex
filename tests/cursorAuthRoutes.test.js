import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCursorAuthRoutes } from "../src/server/cursorAuthRoutes.js";
import { clearCursorAgentAuthCache } from "../src/providers/cursor-composer/cli.js";

describe("Cursor auth routes", () => {
  test("reports status and starts a browser login without returning CLI output", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-cursor-auth-"));
    const agentBin = join(root, "cursor-agent");
    await writeFile(agentBin, [
      "#!/bin/sh",
      "if [ \"$1\" = \"status\" ]; then exit 0; fi",
      "if [ \"$1\" = \"login\" ]; then echo secret-login-output; echo secret-login-error >&2; exit 0; fi",
      "exit 1",
      "",
    ].join("\n"));
    await chmod(agentBin, 0o755);
    clearCursorAgentAuthCache();

    const routes = createCursorAuthRoutes({
      providers: [{ id: "cursor-composer", options: { cursor_agent_bin: agentBin } }],
    });
    const status = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/cursor-auth"),
    );
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.body).connected, true);

    const started = await routes.route(
      { method: "POST" },
      new URL("http://127.0.0.1/api/cursor-auth/login"),
    );
    assert.equal(started.status, 202);
    const startedBody = JSON.parse(started.body);
    assert.match(startedBody.login.id, /^cursor_login_/);
    assert.doesNotMatch(started.body, /secret-login/);

    let finished;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = await routes.route(
        { method: "GET" },
        new URL(`http://127.0.0.1/api/cursor-auth/login/${startedBody.login.id}`),
      );
      if (JSON.parse(finished.body).login.status !== "pending") break;
    }
    assert.equal(finished.status, 200);
    const finishedBody = JSON.parse(finished.body);
    assert.equal(finishedBody.login.status, "complete");
    assert.equal(finishedBody.connected, true);
  });

  test("reports a missing Cursor Agent CLI without exposing a model as authenticated", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-cursor-auth-"));
    const missing = join(root, "missing-cursor-agent");
    clearCursorAgentAuthCache();
    const routes = createCursorAuthRoutes({
      providers: [{ id: "cursor-composer", options: { cursor_agent_bin: missing } }],
    });
    const result = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/cursor-auth"),
    );
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.connected, false);
    assert.equal(body.reason, "not-installed");
    assert.match(body.message, /not found/i);
  });

  test("does not treat Cursor's successful Not logged in status as authenticated", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-cursor-auth-"));
    const agentBin = join(root, "cursor-agent");
    await writeFile(agentBin, "#!/bin/sh\necho 'Not logged in'\nexit 0\n");
    await chmod(agentBin, 0o755);
    clearCursorAgentAuthCache();
    const routes = createCursorAuthRoutes({
      providers: [{ id: "cursor-composer", options: { cursor_agent_bin: agentBin } }],
    });
    const result = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/cursor-auth"),
    );
    const body = JSON.parse(result.body);
    assert.equal(body.connected, false);
    assert.equal(body.reason, "not-authenticated");
  });

  test("refreshes the authenticated Cursor account model list", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "shimex-cursor-models-"));
    const agentBin = join(runtimeHome, "cursor-agent");
    await writeFile(agentBin, [
      "#!/bin/sh",
      "if [ \"$1\" = status ]; then exit 0; fi",
      "if [ \"$1\" = models ]; then",
      "  echo 'Available models'",
      "  echo 'gpt-5.5 - GPT-5.5'",
      "  echo 'claude-sonnet-5-thinking-high - Claude Sonnet 5 1M Thinking'",
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"));
    await chmod(agentBin, 0o755);
    clearCursorAgentAuthCache();

    const config = {
      runtime: { home: runtimeHome },
      providers: [{ id: "cursor-composer", options: { cursor_agent_bin: agentBin } }],
    };
    const routes = createCursorAuthRoutes(config);
    const result = await routes.route(
      { method: "POST" },
      new URL("http://127.0.0.1/api/cursor-auth/refresh"),
    );
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.refreshed, true);
    assert.equal(body.count, 2);

    const models = await routes.route(
      { method: "GET" },
      new URL("http://127.0.0.1/api/cursor-auth"),
    );
    assert.equal(JSON.parse(models.body).connected, true);
  });
});
