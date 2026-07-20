import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleProviderModelRequest } from "../src/providers/adapter.js";

describe("Provider request adapters", () => {
  test("routes Responses requests to OpenAI-compatible chat endpoints", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      testConfig({
        id: "lm-studio",
        endpoint: "http://127.0.0.1:1234/v1",
        models: [modelConfig({ slug: "lm-local", upstreamModel: "local-upstream" })],
      }),
      "/v1/responses",
      { model: "lm-local", input: "hello", stream: false },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            created: 123,
            model: "local-upstream",
            choices: [{ message: { role: "assistant", content: "hello back" } }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(calls[0].url, "http://127.0.0.1:1234/v1/chat/completions");
    assert.equal(JSON.parse(calls[0].init.body).model, "local-upstream");
    const payload = JSON.parse(result.body);
    assert.equal(payload.model, "lm-local");
    assert.equal(payload.output[0].content[0].text, "hello back");
  });

  test("normalizes Responses tool parameter schemas for OpenAI-compatible chat endpoints", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      testConfig({
        id: "lm-studio",
        endpoint: "http://127.0.0.1:1234/v1",
        models: [modelConfig({ slug: "lm-local", upstreamModel: "local-upstream" })],
      }),
      "/v1/responses",
      {
        model: "lm-local",
        input: "hello",
        stream: false,
        tools: [
          { type: "function", name: "missing_parameters" },
          { type: "function", name: "missing_type", parameters: { properties: { path: { type: "string" } } } },
          { type: "function", name: "nullable_object", parameters: { type: ["object", "null"], properties: { path: { type: "string" } } } },
          { type: "function", name: "scalar_schema", parameters: { type: "string" } },
          {
            type: "namespace",
            name: "codex_app",
            tools: [
              {
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
              },
            ],
          },
        ],
      },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            created: 123,
            model: "local-upstream",
            choices: [{ message: { role: "assistant", content: "hello back" } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[0].init.body);
    assert.deepEqual(upstreamBody.tools.map((tool) => tool.function.name), [
      "missing_parameters",
      "missing_type",
      "nullable_object",
      "scalar_schema",
      "send_message_to_thread",
    ]);
    assert.deepEqual(upstreamBody.tools.map((tool) => tool.function.parameters.type), ["object", "object", "object", "object", "object"]);
    assert.deepEqual(upstreamBody.tools[0].function.parameters.properties, {});
    assert.deepEqual(upstreamBody.tools[1].function.parameters.required, undefined);
    assert.equal(upstreamBody.tools[2].function.parameters.properties.path.type, "string");
    assert.deepEqual(upstreamBody.tools[3].function.parameters.required, ["value"]);
    assert.equal(upstreamBody.tools[4].function.parameters.properties.threadId.type, "string");
  });

  test("maps freeform apply_patch to a required patch argument for chat endpoints", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      testConfig({
        id: "lm-studio",
        endpoint: "http://127.0.0.1:1234/v1",
        models: [modelConfig({ slug: "lm-local", upstreamModel: "local-upstream" })],
      }),
      "/v1/responses",
      {
        model: "lm-local",
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
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            created: 123,
            model: "local-upstream",
            choices: [{ message: { role: "assistant", content: "done" } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[0].init.body);
    assert.equal(upstreamBody.tools[0].function.name, "apply_patch");
    assert.deepEqual(upstreamBody.tools[0].function.parameters.required, ["patch"]);
    assert.equal(upstreamBody.tools[0].function.parameters.properties.patch.type, "string");
    assert.equal(upstreamBody.tools[0].function.parameters.additionalProperties, false);
  });

  test("converts Responses function call outputs into valid chat tool turns", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      testConfig({
        id: "lm-studio",
        endpoint: "http://127.0.0.1:1234/v1",
        models: [modelConfig({ slug: "lm-local", upstreamModel: "local-upstream" })],
      }),
      "/v1/responses",
      {
        model: "lm-local",
        input: [
          { role: "user", content: [{ type: "input_text", text: "list admin files" }] },
          { type: "function_call", call_id: "call_1", name: "list_files", arguments: "{\"path\":\"src/admin\"}" },
          { type: "function_call_output", call_id: "call_1", output: "page.js" },
        ],
        stream: false,
      },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            created: 123,
            model: "local-upstream",
            choices: [{ message: { role: "assistant", content: "Next I will open page.js." } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    const upstreamBody = JSON.parse(calls[0].init.body);
    assert.deepEqual(upstreamBody.messages, [
      { role: "user", content: "list admin files" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "list_files", arguments: "{\"path\":\"src/admin\"}" },
        }],
      },
      { role: "tool", tool_call_id: "call_1", content: "page.js" },
    ]);
  });

  test("rejects image input when configured model is text-only", async () => {
    const result = await handleProviderModelRequest(
      testConfig({
        id: "openai-compatible",
        endpoint: "https://example.test/v1",
        models: [modelConfig({ slug: "text-only", upstreamModel: "text-upstream", inputModalities: ["text"] })],
      }),
      "/v1/responses",
      {
        model: "text-only",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "look" },
            { type: "input_image", image_url: "data:image/png;base64,abc" },
          ],
        }],
      },
      { fetch: async () => assert.fail("text-only image requests must not reach upstream") },
    );

    assert.equal(result.status, 400);
    assert.match(JSON.parse(result.body).error.message, /does not support image/);
  });

  test("routes chat requests to Responses-compatible endpoints", async () => {
    const previous = process.env.OPENAI_RESPONSES_API_KEY;
    process.env.OPENAI_RESPONSES_API_KEY = "responses-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "openai-responses",
          endpoint: "https://responses.example/v1",
          auth: { type: "env", name: "OPENAI_RESPONSES_API_KEY" },
          models: [modelConfig({ slug: "responses-model", upstreamModel: "resp-upstream" })],
        }),
        "/v1/chat/completions",
        { model: "responses-model", messages: [{ role: "user", content: "hello" }], stream: false },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "resp_1",
              created_at: 456,
              model: "resp-upstream",
              output: [{
                id: "msg_1",
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "hi", annotations: [] }],
              }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      assert.equal(calls[0].url, "https://responses.example/v1/responses");
      assert.equal(calls[0].init.headers.authorization, "Bearer responses-key");
      assert.equal(JSON.parse(calls[0].init.body).model, "resp-upstream");
      const payload = JSON.parse(result.body);
      assert.equal(payload.model, "responses-model");
      assert.equal(payload.choices[0].message.content, "hi");
    } finally {
      setOrDeleteEnv("OPENAI_RESPONSES_API_KEY", previous);
    }
  });

  test("injects Codex app thread tools and hint into the raw Responses passthrough", async () => {
    const previous = process.env.OPENAI_RESPONSES_API_KEY;
    process.env.OPENAI_RESPONSES_API_KEY = "responses-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "openai-responses",
          endpoint: "https://responses.example/v1",
          auth: { type: "env", name: "OPENAI_RESPONSES_API_KEY" },
          models: [modelConfig({ slug: "responses-model", upstreamModel: "resp-upstream" })],
        }),
        "/v1/responses",
        {
          model: "responses-model",
          instructions: "be brief",
          input: "send a note to the other thread",
          tools: [loadedCodexAppTool()],
          stream: false,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "resp_1",
              created_at: 456,
              model: "resp-upstream",
              output: [{
                id: "msg_1",
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "sent", annotations: [] }],
              }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      const upstreamBody = JSON.parse(calls[0].init.body);
      const toolNames = upstreamBody.tools.flatMap((tool) => (tool.type === "namespace" ? tool.tools.map((nested) => nested.name) : [tool.name]));
      assert.ok(toolNames.includes("navigate_to_codex_page"));
      assert.ok(toolNames.includes("send_message_to_thread"));
      assert.match(upstreamBody.instructions, /be brief/);
      assert.match(upstreamBody.instructions, /Codex app thread tools/);
    } finally {
      setOrDeleteEnv("OPENAI_RESPONSES_API_KEY", previous);
    }
  });

  test("routes Responses requests to Anthropic Messages", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "anthropic",
          endpoint: "https://api.anthropic.com/v1",
          auth: { type: "env", name: "ANTHROPIC_API_KEY" },
          models: [modelConfig({ slug: "claude-test", upstreamModel: "claude-upstream", inputModalities: ["text", "image"] })],
        }),
        "/v1/responses",
        {
          model: "claude-test",
          instructions: "be brief",
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "describe" },
              { type: "input_image", image_url: "data:image/png;base64,abc" },
            ],
          }],
          stream: false,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "msg_1",
              model: "claude-upstream",
              content: [{ type: "text", text: "a small image" }],
              usage: { input_tokens: 4, output_tokens: 3 },
            });
          },
        },
      );

      assert.equal(result.status, 200);
      assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
      assert.equal(calls[0].init.headers["x-api-key"], "anthropic-key");
      const upstreamBody = JSON.parse(calls[0].init.body);
      assert.equal(upstreamBody.model, "claude-upstream");
      assert.equal(upstreamBody.system, "be brief");
      assert.equal(upstreamBody.messages[0].content[1].type, "image");
      const payload = JSON.parse(result.body);
      assert.equal(payload.model, "claude-test");
      assert.equal(payload.output[0].content[0].text, "a small image");
    } finally {
      setOrDeleteEnv("ANTHROPIC_API_KEY", previous);
    }
  });

  test("groups Anthropic tool uses immediately before their tool results", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "anthropic",
          endpoint: "https://api.anthropic.com/v1",
          auth: { type: "env", name: "ANTHROPIC_API_KEY" },
          models: [modelConfig({ slug: "claude-test", upstreamModel: "claude-upstream" })],
        }),
        "/v1/responses",
        {
          model: "claude-test",
          input: [
            { role: "user", content: [{ type: "input_text", text: "show me the architecture" }] },
            { type: "function_call", call_id: "call_00", name: "exec_command", arguments: "{\"cmd\":\"rg\"}" },
            { type: "function_call", call_id: "call_01", name: "exec_command", arguments: "{\"cmd\":\"sed\"}" },
            { type: "function_call_output", call_id: "call_00", output: "rg output" },
            { type: "function_call_output", call_id: "call_01", output: "sed output" },
          ],
          stream: true,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "msg_1",
              model: "claude-upstream",
              content: [{ type: "text", text: "diagram" }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      const upstreamBody = JSON.parse(calls[0].init.body);
      assert.equal(upstreamBody.stream, false);
      assert.deepEqual(upstreamBody.messages, [
        { role: "user", content: "show me the architecture" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "call_00", name: "exec_command", input: { cmd: "rg" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_00", content: "rg output" },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "call_01", name: "exec_command", input: { cmd: "sed" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_01", content: "sed output" },
          ],
        },
      ]);
    } finally {
      setOrDeleteEnv("ANTHROPIC_API_KEY", previous);
    }
  });

  test("keeps Anthropic tool results adjacent when status messages appear between calls and outputs", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "anthropic",
          endpoint: "https://api.anthropic.com/v1",
          auth: { type: "env", name: "ANTHROPIC_API_KEY" },
          models: [modelConfig({ slug: "claude-test", upstreamModel: "claude-upstream" })],
        }),
        "/v1/responses",
        {
          model: "claude-test",
          input: [
            { role: "user", content: [{ type: "input_text", text: "send to another thread" }] },
            { type: "function_call", call_id: "call_00", name: "send_message_to_thread", arguments: "{\"threadId\":\"thread_1\",\"prompt\":\"hi\"}" },
            { role: "assistant", content: [{ type: "output_text", text: "Sending..." }] },
            { type: "function_call_output", call_id: "call_00", output: "sent" },
          ],
          tools: [{
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
          }],
          stream: true,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "msg_1",
              model: "claude-upstream",
              content: [{ type: "text", text: "done" }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      const upstreamBody = JSON.parse(calls[0].init.body);
      assert.deepEqual(upstreamBody.tools.map((tool) => tool.name), ["send_message_to_thread"]);
      assert.equal(upstreamBody.tools[0].input_schema.properties.prompt.type, "string");
      assert.deepEqual(upstreamBody.messages, [
        { role: "user", content: "send to another thread" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Sending..." },
            { type: "tool_use", id: "call_00", name: "send_message_to_thread", input: { threadId: "thread_1", prompt: "hi" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_00", content: "sent" },
          ],
        },
      ]);
    } finally {
      setOrDeleteEnv("ANTHROPIC_API_KEY", previous);
    }
  });

  test("injects Codex app thread tools and hint on the Anthropic route", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "anthropic",
          endpoint: "https://api.anthropic.com/v1",
          auth: { type: "env", name: "ANTHROPIC_API_KEY" },
          models: [modelConfig({ slug: "claude-test", upstreamModel: "claude-upstream" })],
        }),
        "/v1/responses",
        {
          model: "claude-test",
          instructions: "be brief",
          input: [{ role: "user", content: [{ type: "input_text", text: "send a note to the other thread" }] }],
          tools: [loadedCodexAppTool()],
          stream: false,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "msg_1",
              model: "claude-upstream",
              content: [{ type: "text", text: "sent" }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      const upstreamBody = JSON.parse(calls[0].init.body);
      const toolNames = upstreamBody.tools.map((tool) => tool.name);
      assert.ok(toolNames.includes("navigate_to_codex_page"));
      assert.ok(toolNames.includes("send_message_to_thread"));
      assert.ok(toolNames.includes("create_thread"));
      assert.match(upstreamBody.system, /be brief/);
      assert.match(upstreamBody.system, /Codex app thread tools/);
    } finally {
      setOrDeleteEnv("ANTHROPIC_API_KEY", previous);
    }
  });

  test("merges missing thread tools into a client-supplied partial codex_app namespace", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const calls = [];
    try {
      const result = await handleProviderModelRequest(
        testConfig({
          id: "anthropic",
          endpoint: "https://api.anthropic.com/v1",
          auth: { type: "env", name: "ANTHROPIC_API_KEY" },
          models: [modelConfig({ slug: "claude-test", upstreamModel: "claude-upstream" })],
        }),
        "/v1/responses",
        {
          model: "claude-test",
          instructions: "be brief",
          input: [{ role: "user", content: [{ type: "input_text", text: "send a note to the other thread" }] }],
          tools: [
            { type: "function", name: "exec_command", description: "Run a shell command.", parameters: { type: "object", properties: {} } },
            {
              type: "namespace",
              name: "codex_app",
              tools: [{
                type: "function",
                name: "navigate_to_codex_page",
                description: "Navigate the most recently focused main Codex window to a thread.",
                inputSchema: { type: "object", properties: { threadId: { type: "string" } }, required: ["threadId"] },
              }],
            },
          ],
          stream: false,
        },
        {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
              id: "msg_1",
              model: "claude-upstream",
              content: [{ type: "text", text: "sent" }],
            });
          },
        },
      );

      assert.equal(result.status, 200);
      const upstreamBody = JSON.parse(calls[0].init.body);
      const toolNames = upstreamBody.tools.map((tool) => tool.name);
      assert.ok(toolNames.includes("navigate_to_codex_page"));
      assert.ok(toolNames.includes("send_message_to_thread"));
      assert.ok(toolNames.includes("create_thread"));
      assert.ok(toolNames.includes("list_threads"));
      assert.match(upstreamBody.system, /Codex app thread tools/);
    } finally {
      setOrDeleteEnv("ANTHROPIC_API_KEY", previous);
    }
  });

  test("returns 404 for unknown model slugs", async () => {
    const result = await handleProviderModelRequest(testConfig({
      id: "lm-studio",
      endpoint: "http://127.0.0.1:1234/v1",
      models: [],
    }), "/v1/responses", { model: "missing" });
    assert.equal(result.status, 404);
  });

  test("routes Responses requests to ChatGPT Codex passthrough", async () => {
    const authPath = await codexAuthFile();
    const calls = [];
    const result = await handleProviderModelRequest(
      testConfig({
        id: "chatgpt-codex",
        models: [],
      }),
      "/v1/responses",
      {
        model: "gpt-5-5",
        input: "hello",
        stream: false,
        tools: [{ type: "web_search" }],
      },
      {
        authPath,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "resp_1",
            model: "gpt-5.5",
            output: [{
              id: "msg_1",
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "from chatgpt", annotations: [] }],
            }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(calls[0].url, "https://chatgpt.com/backend-api/codex/responses");
    assert.equal(calls[0].init.headers.authorization, "Bearer codex-token");
    const upstreamBody = JSON.parse(calls[0].init.body);
    assert.equal(upstreamBody.model, "gpt-5.5");
    assert.deepEqual(upstreamBody.tools, [{ type: "web_search" }]);
    assert.equal(JSON.parse(result.body).model, "gpt-5-5");
  });

  test("completes ChatGPT Codex streams when upstream omits response.completed", async () => {
    const authPath = await codexAuthFile();
    const result = await handleProviderModelRequest(
      testConfig({
        id: "chatgpt-codex",
        models: [],
      }),
      "/v1/responses",
      { model: "gpt-5-5", input: "hello", stream: true },
      {
        authPath,
        fetch: async () => new Response([
          `event: response.created\r\ndata: ${JSON.stringify({
            type: "response.created",
            response: {
              id: "resp_1",
              object: "response",
              created_at: 123,
              model: "gpt-5.5",
              status: "in_progress",
              output: [],
            },
          })}\r\n\r\n`,
          `event: response.output_text.delta\r\ndata: ${JSON.stringify({
            type: "response.output_text.delta",
            response_id: "resp_1",
            item_id: "msg_1",
            output_index: 0,
            content_index: 0,
            delta: "hello",
          })}`,
        ].join("")),
      },
    );

    assert.equal(result.status, 200);
    const writes = [];
    await result.stream({ write: (chunk) => writes.push(String(chunk)) });
    const text = writes.join("");
    const events = sseEvents(text);
    const completed = events.find((event) => event.type === "response.completed");
    assert.ok(completed);
    assert.equal(completed.response.id, "resp_1");
    assert.equal(completed.response.model, "gpt-5-5");
    assert.equal(completed.response.status, "completed");
    assert.match(text, /data: \[DONE\]/);
  });

  test("routes Responses requests to Cursor Composer bridge", async () => {
    const result = await handleProviderModelRequest(
      testConfig({
        id: "cursor-composer",
        models: [],
      }),
      "/v1/responses",
      { model: "composer-2-5", input: "hello", stream: false },
      {
        runCursorAgent: async function* (prompt, model) {
          assert.equal(model, "composer-2.5");
          assert.match(prompt, /hello/);
          yield { type: "text_delta", delta: "cursor " };
          yield { type: "completed", text: "cursor done" };
        },
      },
    );

    assert.equal(result.status, 200);
    const payload = JSON.parse(result.body);
    assert.equal(payload.model, "composer-2-5");
    assert.equal(payload.output[0].content[0].text, "cursor done");
  });

  test("returns a clean Cursor Composer error when the bridge fails", async () => {
    const result = await handleProviderModelRequest(
      testConfig({
        id: "cursor-composer",
        models: [],
      }),
      "/v1/responses",
      { model: "composer-2-5", input: "hello", stream: false },
      {
        runCursorAgent: async function* () {
          throw new Error("cursor-agent missing");
        },
      },
    );

    assert.equal(result.status, 502);
    assert.match(JSON.parse(result.body).error.message, /cursor-agent missing/);
  });

  test("auto-router rewrites to the cheapest viable configured candidate", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      {
        providers: [
          {
            id: "auto-router",
            enabled: true,
            endpoint: "",
            auth: null,
            models: [],
            options: {
              enabled: true,
              slug: "shimex-auto",
              candidates: [
                { slug: "vision-model", cost: 3 },
                { slug: "text-model", cost: 1 },
              ],
            },
          },
          {
            id: "lm-studio",
            enabled: true,
            endpoint: "http://127.0.0.1:1234/v1",
            auth: null,
            options: {},
            models: [
              modelConfig({ slug: "text-model", upstreamModel: "text-upstream", inputModalities: ["text"] }),
              modelConfig({ slug: "vision-model", upstreamModel: "vision-upstream", inputModalities: ["text", "image"] }),
            ],
          },
        ],
      },
      "/v1/responses",
      { model: "shimex-auto", input: "hello", stream: false },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            model: "text-upstream",
            choices: [{ message: { role: "assistant", content: "routed" } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(JSON.parse(calls[0].init.body).model, "text-upstream");
    assert.equal(JSON.parse(result.body).model, "text-model");
  });

  test("auto-router skips text-only candidates for image requests", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      {
        providers: [
          {
            id: "auto-router",
            enabled: true,
            endpoint: "",
            auth: null,
            models: [],
            options: {
              enabled: true,
              slug: "shimex-auto",
              candidates: [
                { slug: "text-model", cost: 1 },
                { slug: "vision-model", cost: 2 },
              ],
            },
          },
          {
            id: "lm-studio",
            enabled: true,
            endpoint: "http://127.0.0.1:1234/v1",
            auth: null,
            options: {},
            models: [
              modelConfig({ slug: "text-model", upstreamModel: "text-upstream", inputModalities: ["text"] }),
              modelConfig({ slug: "vision-model", upstreamModel: "vision-upstream", inputModalities: ["text", "image"] }),
            ],
          },
        ],
      },
      "/v1/responses",
      {
        model: "shimex-auto",
        input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,abc" }] }],
        stream: false,
      },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({
            id: "chatcmpl_1",
            model: "vision-upstream",
            choices: [{ message: { role: "assistant", content: "vision routed" } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(JSON.parse(calls[0].init.body).model, "vision-upstream");
    assert.equal(JSON.parse(result.body).model, "vision-model");
  });

  test("auto-router can use a classifier model before routing", async () => {
    const calls = [];
    const result = await handleProviderModelRequest(
      {
        providers: [
          {
            id: "auto-router",
            enabled: true,
            endpoint: "",
            auth: null,
            models: [],
            options: {
              enabled: true,
              slug: "shimex-auto",
              classifier: "classifier-model",
              threshold: 0.7,
              candidates: [
                { slug: "cheap-model", cost: 1, card: "Fast but weak." },
                { slug: "expensive-model", cost: 5, card: "Best for complex code." },
              ],
            },
          },
          {
            id: "lm-studio",
            enabled: true,
            endpoint: "http://127.0.0.1:1234/v1",
            auth: null,
            options: {},
            models: [
              modelConfig({ slug: "classifier-model", upstreamModel: "classifier-upstream" }),
              modelConfig({ slug: "cheap-model", upstreamModel: "cheap-upstream" }),
              modelConfig({ slug: "expensive-model", upstreamModel: "expensive-upstream" }),
            ],
          },
        ],
      },
      "/v1/responses",
      { model: "shimex-auto", input: "complex classifier test task", stream: false },
      {
        fetch: async (url, init) => {
          const body = JSON.parse(init.body);
          calls.push(body.model);
          if (body.model === "classifier-upstream") {
            assert.match(body.messages[0].content, /complex classifier test task/);
            return jsonResponse({
              id: "chatcmpl_classifier",
              model: "classifier-upstream",
              choices: [{ message: { role: "assistant", content: "{\"cheap-model\":0.2,\"expensive-model\":0.95}" } }],
            });
          }
          return jsonResponse({
            id: "chatcmpl_answer",
            model: body.model,
            choices: [{ message: { role: "assistant", content: "classified route" } }],
          });
        },
      },
    );

    assert.equal(result.status, 200);
    assert.deepEqual(calls, ["classifier-upstream", "expensive-upstream"]);
    assert.equal(JSON.parse(result.body).model, "expensive-model");
  });
});

function testConfig(provider) {
  return {
    providers: [{
      enabled: true,
      auth: null,
      options: {},
      ...provider,
    }],
  };
}

function modelConfig({ slug, upstreamModel, inputModalities = ["text"] }) {
  return {
    slug,
    displayName: slug,
    upstreamModel,
    contextWindow: 128000,
    inputModalities,
  };
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseEvents(text) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => block.split(/\r?\n/))
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .filter((line) => line !== "[DONE]")
    .map((line) => JSON.parse(line));
}

async function codexAuthFile() {
  const root = await mkdtemp(join(tmpdir(), "shimex-codex-auth-"));
  const path = join(root, "auth.json");
  await writeFile(path, JSON.stringify({
    tokens: {
      access_token: "codex-token",
      account_id: "account_1",
    },
  }));
  return path;
}

function setOrDeleteEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
