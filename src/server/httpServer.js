import { createServer as createHttpServer } from "node:http";
import { adminPage } from "../admin/page.js";
import { deviceLoginPage } from "../admin/deviceLoginPage.js";
import { getShimexCodexDeviceLogin } from "../providers/chatgpt-codex/deviceLogin.js";
import { getShimexClineDeviceLogin } from "../providers/cline-pass/deviceLogin.js";
import { discoverModels, refreshProviderModelCaches } from "../core/modelDiscovery.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { installCodexClient, startCodexClient, syncCodexClient } from "../clients/codex/lifecycle.js";
import { handleProviderModelRequest } from "../providers/adapter.js";
import { createCodexAuthRoutes } from "./codexAuthRoutes.js";
import { createClineAuthRoutes } from "./clineAuthRoutes.js";

export async function createServer(config) {
  await refreshProviderModelCaches(config);
  const codexAuthRoutes = createCodexAuthRoutes(config);
  const clineAuthRoutes = createClineAuthRoutes(config);
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || config.runtime.host}`);
      const result = await routeRequest(config, request, url, { stop: () => server.close(), codexAuthRoutes, clineAuthRoutes });
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

async function routeRequest(config, request, url, control = {}) {
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
  if (pathname === "/api/codex-auths" || pathname.startsWith("/api/codex-auths/")) {
    const result = await control.codexAuthRoutes?.route(request, url);
    if (result) {
      return result;
    }
  }
  if (pathname === "/api/cline-auths" || pathname.startsWith("/api/cline-auths/")) {
    const result = await control.clineAuthRoutes?.route(request, url);
    if (result) {
      return result;
    }
  }
  if (method === "GET" && pathname === "/admin/codex-auth/device") {
    const id = url.searchParams.get("id");
    if (!id) {
      return html("<!doctype html><meta charset=utf-8><title>Codex device login</title><p>Missing device login id. <a href='/admin'>Back</a></p>");
    }
    const login = getShimexCodexDeviceLogin(id);
    if (!login) {
      return html("<!doctype html><meta charset=utf-8><title>Codex device login expired</title><p>This device login was cancelled or expired. <a href='/admin'>Back to admin</a></p>");
    }
    return html(deviceLoginPage(login, { apiBase: "" }));
  }

  if (method === "GET" && pathname === "/admin/cline-auth/device") {
    const id = url.searchParams.get("id");
    if (!id) {
      return html("<!doctype html><meta charset=utf-8><title>Cline device login</title><p>Missing device login id. <a href='/admin'>Back</a></p>");
    }
    const login = getShimexClineDeviceLogin(id);
    if (!login) {
      return html("<!doctype html><meta charset=utf-8><title>Cline device login expired</title><p>This device login was cancelled or expired. <a href='/admin'>Back to admin</a></p>");
    }
    return html(deviceLoginPage(login, {
      apiBase: "",
      provider: "cline",
      providerTitle: "Cline",
      providerShort: "Cline",
      loginLabel: "Cline login",
      statusPath: "/api/cline-auths/device/",
      completePath: "/api/cline-auths/device/",
      cancelPath: "/api/cline-auths/device/",
    }));
  }
  if (method === "POST" && pathname === "/api/install") {
    return json(await installCodexClient(config, { apply: url.searchParams.get("apply") === "1" }));
  }
  if (method === "POST" && pathname === "/api/sync") {
    return json(await syncCodexClient(config, { apply: url.searchParams.get("apply") === "1" }));
  }
  if (method === "POST" && pathname === "/api/open") {
    return json(await startCodexClient(config));
  }
  if (method === "POST" && pathname === "/api/stop") {
    return {
      ...json({ ok: true, stopping: true }),
      afterWrite: () => control.stop?.(),
    };
  }
  if (method === "POST" && routeIsModelRequest(pathname)) {
    const body = await readJsonBody(request);
    logIncomingModelRequest(pathname, body);
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
  result.afterWrite?.();
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function logIncomingModelRequest(pathname, body) {
  try {
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const toolNames = tools.slice(0, 8).flatMap((tool) => {
      const name = tool?.name || tool?.function?.name || tool?.type;
      return name ? [String(name)] : [];
    });
    const input = Array.isArray(body.input) ? body.input : [];
    const inputSummary = input.slice(-8).flatMap((item) => {
      if (!item || typeof item !== "object") {
        return typeof item === "string" ? ["text"] : [];
      }
      const type = item.type || item.role || "?";
      if (type === "function_call") {
        return [`function_call(${String(item.name || "?")})`];
      }
      if (type === "function_call_output") {
        return [`function_call_output(${String(item.call_id || "").slice(0, 24)})`];
      }
      return [String(type)];
    });
    console.log(
      `[req] ${pathname} model=${JSON.stringify(body.model || "")} stream=${JSON.stringify(Boolean(body.stream))} `
        + `tools=${tools.length} (${toolNames.join(",")}) input=${input.length} (${inputSummary.join(",")})`,
    );
  } catch (error) {
    console.log(`[req] failed to summarize request: ${String(error?.message || error)}`);
  }
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
