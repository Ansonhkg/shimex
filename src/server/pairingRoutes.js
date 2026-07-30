import {
  createPairingCode,
  listClients,
  listPairingCodes,
  readModeStore,
  readPairingStore,
  redeemPairingCode,
  revokeAllClients,
  revokeClient,
  writeModeStore,
  writePairingStore,
} from "../core/pairing.js";
import { isLoopbackRequest } from "../core/access.js";
import { publicServerUrl, serverUrl } from "./process.js";
import { resolveAdvertiseUrl } from "../core/network.js";

export function createPairingRoutes(config) {
  return {
    async route(request, url) {
      const method = request.method || "GET";
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/api/access") {
        return await handleAccessStatus(config, request);
      }
      if (method === "POST" && pathname === "/api/mode") {
        return await handleSetMode(config, request);
      }
      if (method === "POST" && pathname === "/api/pair/code") {
        return await handleCreateCode(config, request);
      }
      if (method === "GET" && pathname === "/api/pair/codes") {
        return await handleListCodes(config, request);
      }
      if (method === "POST" && pathname === "/api/pair") {
        return await handleRedeemCode(config, request);
      }
      if (method === "GET" && pathname === "/api/pair/clients") {
        return await handleListClients(config, request);
      }
      if (method === "DELETE" && pathname.startsWith("/api/pair/clients/")) {
        const clientId = decodeURIComponent(pathname.slice("/api/pair/clients/".length));
        return await handleRevokeClient(config, request, clientId);
      }
      if (method === "POST" && pathname === "/api/pair/clients/revoke-all") {
        return await handleRevokeAll(config, request);
      }
      return null;
    },
  };
}

async function handleAccessStatus(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const mode = await readModeStore(config);
  const store = await readPairingStore(config);
  return json({
    mode: mode.mode,
    advertiseUrl: publicServerUrl(config),
    directUrl: serverUrl(config),
    activeCodes: listPairingCodes(store).map(publicCodeView),
    clients: listClients(store),
  });
}

async function handleSetMode(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const body = await readJsonBody(request);
  try {
    const result = await writeModeStore(config, body.mode);
    return json({ ok: true, mode: result.mode });
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 400 });
  }
}

async function handleCreateCode(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const body = await readJsonBody(request);
  const mode = await readModeStore(config);
  if (mode.mode !== "host") {
    return json({ error: "Pairing codes can only be created in host mode." }, { status: 400 });
  }
  const resolved = await resolveAdvertiseUrl(config, { url: body.advertiseUrl || "" });
  const advertiseUrl = resolved.url;
  let store = await readPairingStore(config);
  try {
    const created = createPairingCode(store, {
      advertiseUrl,
      label: body.label || "",
      ttlMs: body.ttlMs,
    });
    await writePairingStore(config, created.store);
    return json({
      ok: true,
      code: publicCodeView(created.code),
      displayCode: created.displayCode,
      advertiseUrl,
      advertiseSource: resolved.source,
      warning: resolved.warning || "",
    });
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 400 });
  }
}

async function handleListCodes(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const store = await readPairingStore(config);
  return json({ codes: listPairingCodes(store).map(publicCodeView) });
}

async function handleRedeemCode(config, request) {
  const body = await readJsonBody(request);
  const displayCode = body.displayCode || body.code || "";
  const store = await readPairingStore(config);
  const mode = await readModeStore(config);
  if (mode.mode !== "host") {
    return json({
      error: "Host is not accepting pairings.",
      type: "shimex_host_unavailable",
    }, { status: 400 });
  }
  const attemptKey = String(request.socket?.remoteAddress || "remote");
  const result = redeemPairingCode(store, displayCode, {
    attemptKey,
    clientLabel: body.clientLabel || body.label || "client",
    pairedFrom: attemptKey,
    hostLabel: body.hostLabel || config.project?.name || "shimex",
  });
  if (!result.ok) {
    if (result.store) {
      await writePairingStore(config, result.store);
    }
    return json({
      error: result.message,
      type: `shimex_${result.error}`,
      retryAfterMs: result.retryAfterMs || 0,
    }, { status: result.error === "rate_limited" ? 429 : 400 });
  }
  await writePairingStore(config, result.store);
  return json({
    ok: true,
    gatewayUrl: result.session.gatewayUrl,
    clientToken: result.session.clientToken,
    clientId: result.session.clientId,
    hostLabel: result.session.hostLabel,
    scopes: result.session.scopes,
    pairedAt: result.session.pairedAt,
    client: result.client,
  });
}

async function handleListClients(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const store = await readPairingStore(config);
  return json({ clients: listClients(store) });
}

async function handleRevokeClient(config, request, clientId) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const store = await readPairingStore(config);
  const result = revokeClient(store, clientId);
  await writePairingStore(config, result.store);
  if (!result.revoked) {
    return json({ error: `client "${clientId}" not found` }, { status: 404 });
  }
  return json({ ok: true, revoked: result.revoked });
}

async function handleRevokeAll(config, request) {
  const localOnly = requireLocal(config, request);
  if (localOnly) return localOnly;
  const store = await readPairingStore(config);
  const result = revokeAllClients(store);
  await writePairingStore(config, result.store);
  return json({ ok: true, revokedIds: result.revokedIds });
}

function requireLocal(config, request) {
  if (isLoopbackRequest(request, config)) {
    return null;
  }
  return json({
    error: "This pairing control endpoint is local-only.",
    type: "shimex_auth_forbidden",
  }, { status: 403 });
}

function publicCodeView(code) {
  return {
    id: code.id,
    code: code.code,
    displayCode: code.displayCode,
    advertiseUrl: code.advertiseUrl,
    createdAt: code.createdAt,
    expiresAt: code.expiresAt,
    label: code.label || "",
  };
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

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
