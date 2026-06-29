import { adminPage } from "../admin/page.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";

export async function createServer(config) {
  return Bun.serve({
    hostname: config.runtime.host,
    port: config.runtime.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "shimex" });
      }
      if (request.method === "GET" && url.pathname === "/admin") {
        return html(adminPage());
      }
      if (request.method === "GET" && url.pathname === "/api/models") {
        return json(await discoverModels(config));
      }
      if (request.method === "GET" && url.pathname === "/v1/models") {
        const now = Math.floor(Date.now() / 1000);
        const data = (await discoverModels(config)).map((model) => ({
          id: model.slug,
          object: "model",
          created: now,
          owned_by: model.providerId,
        }));
        return json({ object: "list", data });
      }
      if (request.method === "GET" && url.pathname === "/codex/model-catalog.json") {
        return json(generateCodexCatalog(await discoverModels(config)));
      }
      if (request.method === "POST" && routeIsModelRequest(url.pathname)) {
        return json({
          error: {
            message: "Provider request adapters are scaffolded but not ported yet.",
            type: "shimex_adapter_not_implemented",
          },
        }, { status: 501 });
      }
      return json({ error: "not found" }, { status: 404 });
    },
  });
}

function routeIsModelRequest(pathname) {
  return ["/v1/chat/completions", "/v1/responses", "/v1/responses/compact"].includes(pathname);
}

function json(value, init = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function html(value) {
  return new Response(value, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

