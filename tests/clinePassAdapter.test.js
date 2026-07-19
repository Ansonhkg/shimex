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

  test("adds deferred Codex app thread tools when only loaded app tools are sent", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-glm-5-2",
        input: "say hi to designer",
        stream: false,
        tools: [loadedCodexAppTool()],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_1",
              created: 123,
              choices: [{
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "send_message_to_thread",
                      arguments: "{\"threadId\":\"thread_1\",\"prompt\":\"hi\"}",
                    },
                  }],
                },
              }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[1].init.body);
    const toolNames = upstreamBody.tools.map((tool) => tool.function.name);
    assert.ok(toolNames.includes("navigate_to_codex_page"));
    assert.ok(toolNames.includes("send_message_to_thread"));
    assert.match(upstreamBody.messages[0].content, /Codex app thread tools/);
    const payload = JSON.parse(result.body);
    assert.equal(payload.output[0].name, "send_message_to_thread");
    assert.equal(payload.output[0].namespace, "codex_app");
  });

  test("does not duplicate Codex thread tools already supplied by the client", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-kimi-k3",
        input: "hello",
        stream: false,
        tools: [
          loadedCodexAppTool(),
          {
            type: "function",
            name: "create_thread",
            description: "Create a thread.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        ],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_kimi_k3",
              choices: [{ message: { role: "assistant", content: "hello" } }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[1].init.body);
    const names = upstreamBody.tools.map((tool) => tool.function.name);
    assert.equal(names.filter((name) => name === "create_thread").length, 1);
    assert.equal(names.filter((name) => name === "send_message_to_thread").length, 1);
  });

  test("restores namespace fields on ClinePass Responses function calls", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-glm-5-2",
        input: "say hi to designer",
        stream: false,
        tools: [codexAppNamespaceTool()],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_1",
              created: 123,
              choices: [{
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "send_message_to_thread",
                      arguments: "{\"threadId\":\"thread_1\",\"prompt\":\"hi\"}",
                    },
                  }],
                },
              }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[1].init.body);
    assert.match(upstreamBody.messages[0].content, /Codex app thread tools/);
    assert.match(upstreamBody.messages[0].content, /do not call list_mcp_resources/);
    assert.deepEqual(upstreamBody.tools.map((tool) => tool.function.name), ["send_message_to_thread"]);
    const payload = JSON.parse(result.body);
    assert.equal(payload.output[0].type, "function_call");
    assert.equal(payload.output[0].name, "send_message_to_thread");
    assert.equal(payload.output[0].namespace, "codex_app");
  });

  test("maps freeform apply_patch to a required patch argument", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-glm-5-2",
        input: "edit a file",
        stream: false,
        tools: [{
          type: "custom",
          name: "apply_patch",
          description: "Apply a patch to files.",
          format: { type: "grammar", syntax: "lark", definition: "start: /.+/" },
        }],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_1",
              created: 123,
              choices: [{ message: { role: "assistant", content: "ready" } }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[1].init.body);
    assert.equal(upstreamBody.tools[0].function.name, "apply_patch");
    assert.deepEqual(upstreamBody.tools[0].function.parameters.required, ["patch"]);
    assert.equal(upstreamBody.tools[0].function.parameters.properties.patch.type, "string");
  });

  test("removes enum and const constraints that contradict their JSON schema type", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-kimi-k3",
        input: "run the test",
        stream: false,
        tools: [{
          type: "function",
          name: "test_submit",
          description: "Submit a test.",
          parameters: {
            type: "object",
            properties: {
              invalidEnum: { type: "string", enum: [true] },
              mixedEnum: { type: "string", enum: [true, "valid"] },
              invalidConst: { type: "string", const: false },
            },
          },
        }],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({ data: { choices: [{ message: { role: "assistant", content: "done" } }] } });
        },
      },
    );

    assert.equal(result.status, 200);
    const properties = JSON.parse(calls[1].init.body).tools[0].function.parameters.properties;
    assert.equal(Object.hasOwn(properties.invalidEnum, "enum"), false);
    assert.deepEqual(properties.mixedEnum.enum, ["valid"]);
    assert.equal(Object.hasOwn(properties.invalidConst, "const"), false);
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

  test("surfaces ClinePass SSE errors as failed Responses events", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-kimi-k3", input: "hello", stream: true },
      {
        providerSettingsPath,
        fetch: async (url) => {
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return new Response(
            'data: {"success":false,"error":"Invalid request: function name create_thread is duplicated"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
    );

    const writes = [];
    await result.stream({ write: (chunk) => writes.push(String(chunk)) });
    const events = sseEvents(writes.join(""));
    assert.equal(events[0].type, "response.created");
    assert.equal(events[1].type, "response.failed");
    assert.match(events[1].response.error.message, /create_thread is duplicated/);
    assert.equal(events.some((event) => event.type === "response.completed"), false);
  });

  test("surfaces the provider validation detail nested in ClinePass SSE errors", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-kimi-k3", input: "hello", stream: true },
      {
        providerSettingsPath,
        fetch: async (url) => {
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return new Response(
            'data: {"error":{"message":"Bad Request","param":{"error":"generic"}},"providerMetadata":{"gateway":{"routing":{"modelAttempts":[{"providerAttempts":[{"error":"Invalid tool schema: unsupported keyword"}]}]}}}}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
    );

    const writes = [];
    await result.stream({ write: (chunk) => writes.push(String(chunk)) });
    const failed = sseEvents(writes.join("")).find((event) => event.type === "response.failed");
    assert.equal(failed.response.error.message, "Invalid tool schema: unsupported keyword");
  });

  test("streams chat tool calls as Responses function call events", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-glm-5-2", input: "hello", stream: true, tools: [codexAppNamespaceTool()] },
      {
        providerSettingsPath,
        fetch: async (url) => {
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return new Response(
            [
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"send_message_to_thread","arguments":"{\\"threadId\\""}}]}}]}\n\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"thread_1\\",\\"prompt\\":\\"hi\\"}"}}]}}]}\n\n',
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
    assert.match(text, /"name":"send_message_to_thread"/);
    assert.match(text, /"namespace":"codex_app"/);
    assert.match(text, /"arguments":"{\\"threadId\\":\\"thread_1\\",\\"prompt\\":\\"hi\\"}"/);
    assert.match(text, /response.completed/);
    const completed = sseEvents(text).find((event) => event.type === "response.completed");
    assert.equal(completed.response.output.length, 1);
    assert.equal(completed.response.output[0].type, "function_call");
    assert.equal(completed.response.output[0].namespace, "codex_app");
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

  test("routes Kimi K3 through the ClinePass chat endpoint", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      { model: "cline-pass-kimi-k3", input: "hello", stream: false },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_kimi_k3",
              created: 123,
              choices: [{ message: { role: "assistant", content: "hello from Kimi K3" } }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(calls[1].url, "https://api.cline.bot/api/v1/chat/completions");
    assert.equal(JSON.parse(calls[1].init.body).model, "cline-pass/kimi-k3");
    assert.equal(JSON.parse(result.body).output[0].content[0].text, "hello from Kimi K3");
  });

  test("keeps every parallel Kimi K3 tool result as a separate chat message", async () => {
    const providerSettingsPath = await clineSettingsFile();
    const calls = [];
    const result = await handleClinePassModelRequest(
      {
        model: "cline-pass-kimi-k3",
        stream: false,
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "inspect both files" }] },
          { type: "function_call", call_id: "exec_command_8", name: "exec_command", arguments: "{\"cmd\":\"one\"}" },
          { type: "function_call", call_id: "exec_command_9", name: "exec_command", arguments: "{\"cmd\":\"two\"}" },
          { type: "function_call_output", call_id: "exec_command_8", output: "first result" },
          { type: "function_call_output", call_id: "exec_command_9", output: "second result" },
        ],
      },
      {
        providerSettingsPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (String(url).endsWith("/auth/refresh")) {
            return jsonResponse({ data: { accessToken: "fresh-token", refreshToken: "next-refresh" } });
          }
          return jsonResponse({
            data: {
              id: "chatcmpl_kimi_k3",
              choices: [{ message: { role: "assistant", content: "both inspected" } }],
            },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const messages = JSON.parse(calls[1].init.body).messages;
    assert.deepEqual(messages.slice(-3).map((message) => ({
      role: message.role,
      ids: message.tool_calls?.map((call) => call.id),
      toolCallId: message.tool_call_id,
      content: message.content,
    })), [
      {
        role: "assistant",
        ids: ["exec_command_8", "exec_command_9"],
        toolCallId: undefined,
        content: null,
      },
      {
        role: "tool",
        ids: undefined,
        toolCallId: "exec_command_8",
        content: "first result",
      },
      {
        role: "tool",
        ids: undefined,
        toolCallId: "exec_command_9",
        content: "second result",
      },
    ]);
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

function loadedCodexAppTool() {
  return {
    type: "function",
    name: "navigate_to_codex_page",
    description: "Navigate the most recently focused main Codex window to a thread.",
    parameters: {
      type: "object",
      properties: {
        threadId: { type: "string" },
      },
      required: ["threadId"],
    },
  };
}

function codexAppNamespaceTool() {
  return {
    type: "namespace",
    name: "codex_app",
    tools: [{
      type: "function",
      name: "send_message_to_thread",
      description: "Send a follow-up prompt to an existing Codex thread.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["threadId", "prompt"],
      },
    }],
  };
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
