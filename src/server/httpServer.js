import { createServer as createHttpServer } from "node:http";
import { adminPage } from "../admin/page.js";
import { joinPage } from "../admin/joinPage.js";
import { deviceLoginPage } from "../admin/deviceLoginPage.js";
import { getShimexCodexDeviceLogin } from "../providers/chatgpt-codex/deviceLogin.js";
import { getShimexClineDeviceLogin } from "../providers/cline-pass/deviceLogin.js";
import { discoverModels, refreshProviderModelCaches } from "../core/modelDiscovery.js";
import { codexDisplayName, generateCodexCatalog } from "../clients/codex/catalog.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { installCodexClient, startCodexClient, syncCodexClient } from "../clients/codex/lifecycle.js";
import { handleProviderModelRequest } from "../providers/adapter.js";
import { createCodexAuthRoutes } from "./codexAuthRoutes.js";
import { createClineAuthRoutes } from "./clineAuthRoutes.js";
import { createGrokAuthRoutes } from "./grokAuthRoutes.js";
import { createCursorAuthRoutes } from "./cursorAuthRoutes.js";
import { createPairingRoutes } from "./pairingRoutes.js";
import { authorizeRequest, resolveAccessContext } from "../core/access.js";
import { setupScriptResponse } from "./joinSetup.js";
import { createDesktopBundleStream, getDesktopBundleInfo } from "./desktopBundle.js";
import { generateLlmsTxt } from "./llmsTxt.js";
import {
  listShimexProviderSections,
  readShimexConfigFile,
  replaceShimexProviderSection,
  validateShimexConfigText,
  writeShimexConfigFile,
} from "../core/configFile.js";
import { readProjectEnvFile, validateProjectEnvText, writeProjectEnvFile } from "../core/env.js";
import { restartHostService } from "./service.js";

export async function createServer(config) {
  await refreshProviderModelCaches(config);
  const codexAuthRoutes = createCodexAuthRoutes(config);
  const clineAuthRoutes = createClineAuthRoutes(config);
  const grokAuthRoutes = createGrokAuthRoutes(config);
  const cursorAuthRoutes = createCursorAuthRoutes(config);
  const pairingRoutes = createPairingRoutes(config);
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || config.runtime.host}`);
      const access = await resolveAccessContext(config, request);
      const auth = authorizeRequest(url.pathname, request.method || "GET", access);
      if (!auth.ok) {
        writeResponse(response, json({ error: auth.error }, { status: auth.status || 401 }));
        return;
      }
      const result = await routeRequest(config, request, url, {
        stop: () => server.close(),
        codexAuthRoutes,
        clineAuthRoutes,
        grokAuthRoutes,
        cursorAuthRoutes,
        pairingRoutes,
        access,
        auth,
      });
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
  if (pathname === "/api/access" || pathname === "/api/mode" || pathname === "/api/pair" || pathname.startsWith("/api/pair/")) {
    const result = await control.pairingRoutes?.route(request, url);
    if (result) {
      return result;
    }
  }
  if (method === "GET" && pathname === "/health") {
    return json({ ok: true, service: "shimex" });
  }
  if (method === "GET" && pathname === "/llms.txt") {
    return text(generateLlmsTxt(await discoverModels(config), config));
  }
  if (method === "GET" && pathname === "/join") {
    return html(joinPage({
      advertiseUrl: `${url.protocol}//${url.host}`,
      code: url.searchParams.get("c") || url.searchParams.get("code") || "",
    }));
  }
  if (method === "GET" && pathname === "/join/setup.sh") {
    return setupScriptResponse(url);
  }
  if (method === "GET" && pathname === "/api/status") {
    const models = await discoverModels(config);
    return json({
      doctor: await codexDoctor(config),
      models: models.map((model) => ({
        ...model,
        pickerDisplayName: codexDisplayName(model),
      })),
      catalog: generateCodexCatalog(models),
      access: {
        mode: control.access?.mode || "host",
        local: Boolean(control.access?.local),
        clientId: control.access?.client?.id || "",
        scopes: control.access?.client?.scopes || [],
      },
    });
  }
  if (method === "GET" && pathname === "/api/config") {
    if (!control.access?.local) {
      return json({ error: { message: "Config editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    const file = await readShimexConfigFile();
    return json({
      path: file.path,
      text: file.text,
      bytes: file.bytes,
      mtime: file.mtime,
      mtimeMs: file.mtimeMs,
      editable: true,
      note: "Saving writes shimex.yml on this host. Restart the host service to apply.",
    });
  }
  if (method === "GET" && pathname === "/api/config/providers") {
    if (!control.access?.local) {
      return json({ error: { message: "Provider configuration is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    const file = await readShimexConfigFile();
    return json({
      path: file.path,
      mtime: file.mtime,
      providers: listShimexProviderSections(file.text),
      note: "Provider forms update only their matching shimex.yml section. Restart the host service to apply.",
    });
  }
  if (method === "PUT" && pathname.startsWith("/api/config/providers/")) {
    if (!control.access?.local) {
      return json({ error: { message: "Provider configuration is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    try {
      const providerId = decodeURIComponent(pathname.slice("/api/config/providers/".length));
      const body = await readJsonBody(request);
      const file = await readShimexConfigFile();
      const nextText = replaceShimexProviderSection(file.text, providerId, body?.provider);
      const saved = await writeShimexConfigFile(nextText);
      const provider = listShimexProviderSections(nextText).find((item) => item.id === providerId);
      return json({
        ...saved,
        provider,
        message: `${providerId} configuration saved. Restart the host service to apply.`,
      });
    } catch (error) {
      return json({ error: String(error?.message || error) }, { status: 400 });
    }
  }
  if (method === "POST" && pathname === "/api/config/validate") {
    if (!control.access?.local) {
      return json({ error: { message: "Config editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    try {
      const body = await readJsonBody(request);
      const validation = await validateShimexConfigText(body?.text ?? "");
      return json({
        ok: true,
        path: validation.path,
        providerCount: validation.providerCount,
        enabledProviders: validation.enabledProviders,
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, { status: 400 });
    }
  }
  if (method === "PUT" && pathname === "/api/config") {
    if (!control.access?.local) {
      return json({ error: { message: "Config editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    try {
      const body = await readJsonBody(request);
      const saved = await writeShimexConfigFile(body?.text ?? "");
      return json({
        ...saved,
        message: "shimex.yml saved. Restart the host service to apply.",
      });
    } catch (error) {
      return json({ error: String(error?.message || error) }, { status: 400 });
    }
  }

  if (method === "GET" && pathname === "/api/env") {
    if (!control.access?.local) {
      return json({ error: { message: "Env editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    const file = await readProjectEnvFile();
    return json({
      path: file.path,
      text: file.text,
      exists: file.exists,
      bytes: file.bytes,
      mtime: file.mtime,
      mtimeMs: file.mtimeMs,
      keys: file.keys,
      editable: true,
      note: "Saving writes .env on this host. Restart the host service to apply.",
    });
  }
  if (method === "POST" && pathname === "/api/env/validate") {
    if (!control.access?.local) {
      return json({ error: { message: "Env editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    try {
      const body = await readJsonBody(request);
      const validation = validateProjectEnvText(body?.text ?? "");
      return json({ ok: true, keyCount: validation.keyCount, keys: validation.keys });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, { status: 400 });
    }
  }
  if (method === "PUT" && pathname === "/api/env") {
    if (!control.access?.local) {
      return json({ error: { message: "Env editing is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    try {
      const body = await readJsonBody(request);
      const saved = await writeProjectEnvFile(body?.text ?? "");
      return json({
        ...saved,
        message: ".env saved. Restart the host service to apply.",
      });
    } catch (error) {
      return json({ error: String(error?.message || error) }, { status: 400 });
    }
  }
  if (method === "POST" && pathname === "/api/host/restart") {
    if (!control.access?.local) {
      return json({ error: { message: "Host restart is local-only.", type: "shimex_local_only" } }, { status: 403 });
    }
    // Kickstart asynchronously so this response can still flush.
    setTimeout(() => {
      restartHostService(config).catch((error) => {
        console.error(`[host-restart] ${String(error?.message || error)}`);
      });
    }, 50);
    return json({
      ok: true,
      restarting: true,
      message: "Host restart requested. Reload the admin page in a moment.",
    });
  }
  if (method === "GET" && pathname === "/admin") {
    return html(adminPage());
  }
  if (method === "GET" && pathname === "/api/models") {
    return json(await discoverModels(config));
  }
  if (method === "GET" && pathname === "/api/desktop/bundle") {
    return json(await getDesktopBundleInfo(config));
  }
  if (method === "GET" && pathname === "/api/desktop/shimex.app.tgz") {
    const result = await createDesktopBundleStream(config);
    if (!result.ok) {
      return json({ error: result.error }, { status: result.status || 404 });
    }
    return result;
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
  if (pathname === "/api/grok-auth" || pathname.startsWith("/api/grok-auth/")) {
    const result = await control.grokAuthRoutes?.route(request, url);
    if (result) return result;
  }
  if (pathname === "/api/cursor-auth" || pathname.startsWith("/api/cursor-auth/")) {
    if (method === "POST" && !control.access?.local) {
      return json({ error: { message: "Cursor browser login must be started on the Shimex host.", type: "shimex_local_only" } }, { status: 403 });
    }
    const result = await control.cursorAuthRoutes?.route(request, url);
    if (result) return result;
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

function text(value) {
  return {
    status: 200,
    body: value,
    headers: { "content-type": "text/plain; charset=utf-8" },
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
