import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleClinePassModelRequest } from "../src/providers/cline-pass/adapter.js";

describe("ClinePass adapter", () => {
  test("refreshes auth and returns Responses-shaped output", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-glm-5-2", input: "hello", stream: false },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({
              data: {
                accessToken: "fresh-token",
                refreshToken: "next-refresh",
                expiresAt: "2099-01-01T00:00:00.000Z",
                userInfo: { clineUserId: "acct_1" },
              },
            });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_1",
              created: 123,
              choices: [{ message: { role: "assistant", content: "hello back" } }],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            },
          });
        },
      },
    );
    assert.equal(result.status, 200);
    const payload = JSON.parse(result.body);
    assert.equal(payload.model, "cline-pass-glm-5-2");
    assert.equal(payload.output[0].content[0].text, "hello back");
    assert.equal(calls[1].init.headers.authorization, "Bearer workos:fresh-token");
    assert.deepEqual(JSON.parse(calls[1].init.body).model, "cline-pass/glm-5.2");
  });

  test("streams chat chunks as Responses events", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-glm-5-2", input: "hello", stream: true },
      {
        providerSettingsPath,
        fetch: async (url) => {
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return new Response(
            [
              'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
              "data: [DONE]\n\n",
            ].join(""),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
    );
    assert.equal(result.status, 200);
    const writes = [];
    await result.stream({ write: (chunk) => writes.push(String(chunk)) });
    const text = writes.join("");
    assert.match(text, /response.output_text.delta/);
    assert.match(text, /hi/);
    assert.match(text, /there/);
    assert.match(text, /response.completed/);
  });

  test("streams chat tool calls as Responses function call events", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-glm-5-2", input: "hello", stream: true },
      {
        providerSettingsPath,
        fetch: async (url) => {
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return new Response(
            [
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"shell","arguments":"{\\"cmd\\""}}]}}]}\n\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"ls\\"}"}}]}}]}\n\n',
              'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
              "data: [DONE]\n\n",
            ].join(""),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
    );
    assert.equal(result.status, 200);
    const writes = [];
    await result.stream({ write: (chunk) => writes.push(String(chunk)) });
    const text = writes.join("");
    assert.match(text, /response.output_item.added/);
    assert.match(text, /function_call/);
    assert.match(text, /response.function_call_arguments.delta/);
    assert.match(text, /response.function_call_arguments.done/);
    assert.match(text, /response.output_item.done/);
    assert.match(text, /"name":"shell"/);
    assert.match(text, /"arguments":"{\\"cmd\\":\\"ls\\"}"/);
    assert.match(text, /response.completed/);
    const completed = sseEvents(text).find((event) => event.type === "response.completed");
    assert.equal(completed.response.output.length, 1);
    assert.equal(completed.response.output[0].type, "function_call");
  });

  test("rejects image input for text-only ClinePass models", async () => {
    const result = await handleClinePassModelRequest({
      model: "cline-pass-glm-5-2",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "look" },
          { type: "input_image", image_url: "data:image/png;base64,abc" },
        ],
      }],
    });
    assert.equal(result.status, 400);
    assert.match(JSON.parse(result.body).error.message, /does not support image/);
  });
});

async function clineSettingsFile() {
  const root = await mkdtemp(join(tmpdir(), "shimex-cline-"));
  const path = join(root, "providers.json");
  await mkdir(root, { recursive: true });
  await writeFile(path, JSON.stringify({
    providers: {
      cline: {
        settings: {
          auth: {
            accessToken: "workos:old-token",
            refreshToken: "refresh-token",
            expiresAt: 0,
          },
        },
      },
    },
  }));
  return path;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseEvents(text) {
  return text
    .split("\n\n")
    .flatMap((event) => event.split(/\r?\n/))
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length).trim())
    .filter((data) => data && data !== "[DONE]")
    .map((data) => JSON.parse(data));
}
