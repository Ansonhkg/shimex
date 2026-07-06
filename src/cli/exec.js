import { loadShimexConfig } from "../core/config.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { ensureServerRunning, serverUrl } from "../server/process.js";

export async function runExec(args) {
  const requestedModel = readFlag(args, "--model");
  if (requestedModel) {
    args = args.filter((arg, i) => arg !== "--model" && (i === 0 || args[i - 1] !== "--model"));
  }
  const promptText = args.join(" ").trim() || await readAllStdin();
  if (!promptText) {
    console.error("usage: shimex exec [--model <slug-or-display-name>] [prompt]");
    console.error("       Provide a prompt as arguments or pipe it via stdin.");
    return 2;
  }
  const config = await loadShimexConfig();
  await ensureServerRunning(config);
  const server = serverUrl(config);
  const model = await resolveExecModel(config, requestedModel);
  if (!model) {
    if (requestedModel) {
      console.error(`No Shimex model matched "${requestedModel}".`);
    } else {
      console.error("No Shimex models available. Run `shimex models list` to see configured models.");
    }
    return 1;
  }
  console.error(`:: model=${model.slug} provider=${model.providerId}`);
  return await streamChatCompletion(server, model.slug, promptText);
}

async function resolveExecModel(config, hint) {
  const models = await discoverModels(config);
  if (!models.length) {
    return null;
  }
  if (!hint) {
    return models[0];
  }
  const lower = hint.toLowerCase();
  const bySlug = models.find((model) => model.slug.toLowerCase() === lower);
  if (bySlug) return bySlug;
  const byDisplay = models.find((model) => model.displayName.toLowerCase() === lower);
  if (byDisplay) return byDisplay;
  const byPrefix = models.find((model) =>
    model.slug.toLowerCase().startsWith(lower) ||
    model.displayName.toLowerCase().startsWith(lower),
  );
  if (byPrefix) return byPrefix;
  return models.find((model) =>
    model.slug.toLowerCase().includes(lower) ||
    model.displayName.toLowerCase().includes(lower),
  ) || null;
}

async function streamChatCompletion(server, modelSlug, prompt) {
  const body = {
    model: modelSlug,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };
  const response = await fetch(`${server}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error(`Shimex gateway returned ${response.status}: ${errorMessage(payload)}`);
    return 1;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content || responseOutputText(payload) || JSON.stringify(payload);
    console.log(text);
    return 0;
  }
  const textStream = readSseText(response);
  for await (const text of textStream) {
    process.stdout.write(text);
  }
  process.stdout.write("\n");
  return 0;
}

async function* readSseText(response) {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emittedText = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const payload = JSON.parse(line.slice(6));
        const delta = textDeltaFromStreamPayload(payload);
        if (delta) {
          if (payload.type === "response.completed" && emittedText) continue;
          emittedText = true;
          yield delta;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }
}

function errorMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return "unknown error";
  }
  if (typeof payload.detail === "string") {
    return payload.detail;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (payload.error?.message) {
    return String(payload.error.message);
  }
  return JSON.stringify(payload);
}

function textDeltaFromStreamPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  // OpenAI Chat Completions stream chunk.
  const chatDelta = payload.choices?.[0]?.delta?.content;
  if (chatDelta) {
    return String(chatDelta);
  }
  // Responses API stream event, used by ChatGPT/Codex passthrough.
  if (payload.type === "response.output_text.delta" && payload.delta) {
    return String(payload.delta);
  }
  if (payload.type === "response.completed") {
    return responseOutputText(payload.response);
  }
  // Defensive fallback for non-standard wrapped events.
  return responseOutputText(payload);
}

function responseOutputText(response) {
  if (!response || typeof response !== "object") {
    return "";
  }
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  const parts = [];
  for (const item of response.output || []) {
    if (!item || typeof item !== "object" || item.type !== "message") {
      continue;
    }
    for (const content of item.content || []) {
      if (content?.text) {
        parts.push(String(content.text));
      }
    }
  }
  return parts.join("\n");
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { buffer += chunk; });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", reject);
  });
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return "";
  return args[index + 1] || "";
}
