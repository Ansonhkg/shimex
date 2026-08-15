import { test } from "node:test";
import assert from "node:assert/strict";
import { handleProviderModelRequest } from "../src/providers/adapter.js";

test("moves all LM Studio system instructions before the conversation", async () => {
  const calls = [];
  const result = await handleProviderModelRequest(
    {
      providers: [{
        id: "lm-studio",
        enabled: true,
        endpoint: "http://127.0.0.1:1234/v1",
        auth: null,
        options: {},
        models: [{
          slug: "lm-local",
          displayName: "LM Local",
          upstreamModel: "local-upstream",
          contextWindow: 128000,
          inputModalities: ["text"],
        }],
      }],
    },
    "/v1/responses",
    {
      model: "lm-local",
      instructions: "Top-level instructions",
      input: [
        { role: "user", content: [{ type: "input_text", text: "First user turn" }] },
        { role: "developer", content: [{ type: "input_text", text: "Late developer instructions" }] },
        { role: "assistant", content: [{ type: "output_text", text: "Earlier answer" }] },
        { role: "system", content: [{ type: "input_text", text: "Late system instructions" }] },
        { role: "user", content: [{ type: "input_text", text: "Continue" }] },
      ],
      stream: false,
    },
    {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({
          id: "chatcmpl_order",
          model: "local-upstream",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(calls[0].init.body).messages, [
    {
      role: "system",
      content: "Top-level instructions\n\nLate developer instructions\n\nLate system instructions",
    },
    { role: "user", content: "First user turn" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Continue" },
  ]);
});

test("teaches LM Studio models to bootstrap the Browser skill", async () => {
  const calls = [];
  await handleProviderModelRequest(
    {
      providers: [{
        id: "lm-studio",
        enabled: true,
        endpoint: "http://127.0.0.1:1234/v1",
        auth: null,
        options: {},
        models: [{
          slug: "lm-local",
          displayName: "LM Local",
          upstreamModel: "local-upstream",
          contextWindow: 128000,
          inputModalities: ["text"],
        }],
      }],
    },
    "/v1/responses",
    {
      model: "lm-local",
      instructions: "Available skills:\n- browser:control-in-app-browser: Control the browser. (file: /data/codex-home/plugins/cache/openai-bundled/browser/1.2.3/skills/control-in-app-browser/SKILL.md)",
      input: "Open bbc.co.uk in Browser.",
      tools: [
        {
          type: "function",
          name: "exec_command",
          description: "Run a command.",
          parameters: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] },
        },
        {
          type: "function",
          name: "js",
          description: "Run browser JavaScript.",
          parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
        },
      ],
      stream: false,
    },
    {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({
          id: "chatcmpl_browser",
          model: "local-upstream",
          choices: [{ message: { role: "assistant", content: "done" } }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  const system = JSON.parse(calls[0].init.body).messages[0].content;
  assert.match(system, /LM Studio Browser tool discipline/);
  assert.match(system, /browser\/1\.2\.3\/skills\/control-in-app-browser\/SKILL\.md/);
  assert.match(system, /Never call list_mcp_resources for Browser/);
});
