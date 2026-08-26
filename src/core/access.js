import {
  authenticateClientToken,
  listClients,
  listPairingCodes,
  readModeStore,
  readPairingStore,
  touchClient,
  writePairingStore,
} from "./pairing.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function extractBearerToken(headers = {}) {
  const authorization = String(headers.authorization || headers.Authorization || "").trim();
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  const apiKey = String(headers["x-api-key"] || headers["X-Api-Key"] || "").trim();
  return apiKey || "";
}

export function isLoopbackRequest(request, config = {}) {
  const remote = normalizeIp(request?.socket?.remoteAddress || request?.connection?.remoteAddress || "");
  if (LOOPBACK_HOSTS.has(remote) || remote.endsWith("%lo0")) {
    return true;
  }
  // Some Node versions report blank remoteAddress for purely local sockets.
  if (!remote) {
    const bindHost = String(config?.runtime?.host || "127.0.0.1").toLowerCase();
    return LOOPBACK_HOSTS.has(bindHost);
  }
  return false;
}

export async function resolveAccessContext(config, request) {
  const modeStore = await readModeStore(config);
  const mode = modeStore.mode || "host";
  const token = extractBearerToken(request?.headers || {});
  const local = isLoopbackRequest(request, config);
  let store = await readPairingStore(config);
  let client = token ? authenticateClientToken(store, token) : null;
  if (client) {
    store = touchClient(store, client.id);
    await writePairingStore(config, store);
    client = authenticateClientToken(store, token);
  }
  return {
    mode,
    local,
    tokenPresent: Boolean(token),
    client,
    store,
  };
}

export function authorizeRequest(pathname, method, access) {
  const path = String(pathname || "");
  const verb = String(method || "GET").toUpperCase();

  // Always public bootstrap endpoints.
  if (path === "/health") {
    return { ok: true, reason: "public" };
  }
  if (verb === "POST" && path === "/api/pair") {
    return { ok: true, reason: "pairing" };
  }
  if (verb === "GET" && (path === "/join" || path.startsWith("/join/"))) {
    return { ok: true, reason: "join-invite" };
  }

  // Local host control plane remains fully available on loopback.
  if (access.local) {
    return { ok: true, reason: "local" };
  }

  // Remote callers need a paired client token once host mode is active.
  if (!access.client) {
    return {
      ok: false,
      status: 401,
      error: {
        message: access.tokenPresent
          ? "Client token is invalid or revoked."
          : "Authorization required. Pair this machine or send a client bearer token.",
        type: "shimex_auth_required",
      },
    };
  }

  const scopes = new Set(access.client.scopes || []);
  if (scopes.has("admin")) {
    return { ok: true, reason: "admin-client", client: access.client };
  }

  if (isModelUsePath(path, verb) && scopes.has("models:use")) {
    return { ok: true, reason: "models-use", client: access.client };
  }
  if (isCatalogPath(path, verb) && (scopes.has("catalog:read") || scopes.has("models:use"))) {
    return { ok: true, reason: "catalog-read", client: access.client };
  }

  return {
    ok: false,
    status: 403,
    error: {
      message: "This client token is not allowed to access that endpoint.",
      type: "shimex_auth_forbidden",
    },
  };
}

export async function hostAccessSummary(config) {
  const modeStore = await readModeStore(config);
  const store = await readPairingStore(config);
  const directUrl = `http://${config.runtime.host}:${config.runtime.port}`;
  return {
    mode: modeStore.mode || "host",
    advertiseUrl: config.runtime.publicUrl || config.runtime.advertiseUrl || directUrl,
    directUrl,
    activeCodes: listPairingCodes(store),
    clients: listClients(store),
  };
}

function isModelUsePath(path, method) {
  if (method === "POST" && ["/v1/chat/completions", "/v1/responses", "/v1/responses/compact"].includes(path)) {
    return true;
  }
  if (method === "GET" && (
    path === "/v1/models"
    || path === "/api/models"
    || path === "/api/status"
    || path === "/api/desktop/shimex.app.tgz"
    || path === "/api/desktop/bundle"
  )) {
    return true;
  }
  return false;
}

function isCatalogPath(path, method) {
  return method === "GET" && (
    path === "/codex/model-catalog.json"
    || path === "/llms.txt"
    || path === "/v1/models"
    || path === "/api/models"
    || path === "/api/status"
    || path === "/api/desktop/shimex.app.tgz"
    || path === "/api/desktop/bundle"
  );
}

function normalizeIp(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.startsWith("::ffff:")) {
    return raw.slice(7);
  }
  return raw;
}
