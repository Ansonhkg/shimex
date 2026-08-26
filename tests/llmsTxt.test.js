import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server/httpServer.js";
import { generateLlmsTxt } from "../src/server/llmsTxt.js";

describe("generated llms.txt", () => {
  test("lists discovered models and their direct and Codex thread commands", () => {
    const text = generateLlmsTxt([{
      slug: "grok-4-6",
      displayName: "Grok 4.6",
      providerDisplayName: "Grok",
      contextWindow: 500000,
      inputModalities: ["text", "image"],
      supportedReasoningLevels: [{ effort: "xhigh" }, { effort: "high" }],
    }], { codex: { profileHome: "~/.shimex/codex-profile" } });

    assert.match(text, /# Shimex/);
    assert.match(text, /codex --model <MODEL_SLUG>/);
    assert.match(text, /codex resume <THREAD_ID>/);
    assert.match(text, /\/v1\/chat\/completions/);
    assert.match(text, /\/v1\/responses\/compact/);
    assert.match(text, /\/api\/pair\/clients\/revoke-all/);
    assert.match(text, /\/api\/cursor-auth\/refresh/);
    assert.match(text, /### Grok 4\.6/);
    assert.match(text, /Model slug: `grok-4-6`/);
    assert.match(text, /npm run shimex -- exec --model 'grok-4-6' \"YOUR PROMPT\"/);
    assert.match(text, /CODEX_HOME='.*\/\.shimex\/codex-profile' codex resume <THREAD_ID> --model 'grok-4-6'/);
    assert.match(text, /reasoning: xhigh, high/);
  });

  test("serves a current generated document from the local gateway", async () => {
    const home = await mkdtemp(join(tmpdir(), "shimex-llms-"));
    const server = await createServer({
      runtime: { host: "127.0.0.1", port: 0, home },
      codex: { profileHome: join(home, "profile") },
      providers: [{
        id: "deepseek",
        enabled: true,
        models: [{
          slug: "deepseek-v4-pro",
          displayName: "DeepSeek V4 Pro",
          upstreamModel: "deepseek-v4-pro",
          contextWindow: 1000000,
          inputModalities: ["text"],
        }],
      }],
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/llms.txt`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.match(await response.text(), /deepseek-v4-pro/);
    } finally {
      server.stop();
      await server.closed;
    }
  });
});
