import { createServer as createHttpServer } from "node:http";
import { adminPage } from "../admin/page.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { installCodexClient, openCodexClient, syncCodexClient } from "../clients/codex/lifecycle.js";
import { handleProviderModelRequest } from "../providers/adapter.js";
import { handleClinePassModelRequest } from "../providers/cline-pass/adapter.js";

export async function createServer(config) {
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || config.runtime.host}`);
      const result = await routeRequest(config, request, url);
      writeResponse(response, result);
    } catch (error) {
      writeResponse(response, json({ error: String(error?.message || error) }, { status: 500 }));
    }
  });
  await listen(server, config.runtime.port, config.runtime.host);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.runtime.port;
  return {
    hostname: config.runtime.host,
    port,
    closed: new Promise((resolve) => server.once("close", resolve)),
    stop: () => server.close(),
  };
}

async function routeRequest(config, request, url) {
  const method = request.method || "GET";
  const pathname = url.pathname;
  if (method === "GET" && pathname === "/health") {
    return json({ ok: true, service: "shimex" });
  }
  if (method === "GET" && pathname === "/api/status") {
    return json({
      doctor: await codexDoctor(config),
      models: await discoverModels(config),
    });
  }
  if (method === "GET" && pathname === "/admin") {
    return html(adminPage());
  }
  if (method === "GET" && pathname === "/api/models") {
    return json(await discoverModels(config));
  }
  if (method === "GET" && pathname === "/v1/models") {
    const now = Math.floor(Date.now() / 1000);
    const data = (await discoverModels(config)).map((model) => ({
      id: model.slug,
      object: "model",
      created: now,
      owned_by: model.providerId,
    }));
    return json({ object: "list", data });
  }
  if (method === "GET" && pathname === "/codex/model-catalog.json") {
    return json(generateCodexCatalog(await discoverModels(config)));
  }
  if (method === "POST" && pathname === "/api/install") {
    return json(await installCodexClient(config, { apply: url.searchParams.get("apply") === "1" }));
  }
  if (method === "POST" && pathname === "/api/sync") {
    return json(await syncCodexClient(config, { apply: url.searchParams.get("apply") === "1" }));
  }
  if (method === "POST" && pathname === "/api/open") {
    return json(await openCodexClient(config));
  }
  if (method === "POST" && routeIsModelRequest(pathname)) {
    const body = await readJsonBody(request);
    const clinePass = await handleClinePassModelRequest(body);
    if (clinePass) {
      return clinePass;
    }
    return await handleProviderModelRequest(config, pathname, body, { headers: request.headers });
  }
  return json({ error: "not found" }, { status: 404 });
}

function routeIsModelRequest(pathname) {
  return ["/v1/chat/completions", "/v1/responses", "/v1/responses/compact"].includes(pathname);
}

function json(value, init = {}) {
  return {
    status: init.status || 200,
    body: JSON.stringify(value, null, 2),
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  };
}

function html(value) {
  return {
    status: 200,
    body: value,
    headers: { "content-type": "text/html; charset=utf-8" },
  };
}

function writeResponse(response, result) {
  if (result.stream) {
    response.writeHead(result.status, result.headers);
    result.stream(response)
      .then(() => response.end())
      .catch((error) => {
        response.write(`data: ${JSON.stringify({ error: String(error?.message || error) })}\n\n`);
        response.end();
      });
    return;
  }
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
