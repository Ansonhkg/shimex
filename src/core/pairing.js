import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expandHome } from "./paths.js";

export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_CLIENT_SCOPES = ["models:use", "catalog:read"];
export const ADMIN_CLIENT_SCOPES = ["models:use", "catalog:read", "admin"];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function pairingStorePath(config) {
  return join(runtimeHome(config), "pairing.json");
}

export function clientSessionPath(config) {
  return join(runtimeHome(config), "client-session.json");
}

export function modeStorePath(config) {
  return join(runtimeHome(config), "mode.json");
}

export async function readPairingStore(config) {
  const path = pairingStorePath(config);
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return normalizePairingStore(data, path);
  } catch {
    return emptyPairingStore(path);
  }
}

export async function writePairingStore(config, store) {
  const path = pairingStorePath(config);
  await mkdir(dirname(path), { recursive: true });
  const payload = {
    version: 1,
    codes: Object.fromEntries(
      Object.values(store.codes || {}).map((code) => [code.id, serializePairingCode(code)]),
    ),
    clients: Object.fromEntries(
      Object.values(store.clients || {}).map((client) => [client.id, serializeClient(client)]),
    ),
    failedAttempts: store.failedAttempts || {},
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return { path, written: true };
}

export async function readModeStore(config) {
  const path = modeStorePath(config);
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    const mode = normalizeMode(data?.mode);
    return { path, mode: mode || "host" };
  } catch {
    return { path, mode: "host" };
  }
}

export async function writeModeStore(config, mode) {
  const path = modeStorePath(config);
  const normalized = normalizeMode(mode);
  if (!normalized) {
    throw new Error('mode must be "host" or "client"');
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ version: 1, mode: normalized, updatedAt: nowIso() }, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return { path, mode: normalized };
}

export async function readClientSession(config) {
  const path = clientSessionPath(config);
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    if (!data?.gatewayUrl || !data?.clientToken) {
      return null;
    }
    return {
      path,
      gatewayUrl: String(data.gatewayUrl).replace(/\/+$/, ""),
      clientToken: String(data.clientToken),
      clientId: String(data.clientId || ""),
      hostLabel: String(data.hostLabel || ""),
      scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : DEFAULT_CLIENT_SCOPES.slice(),
      pairedAt: String(data.pairedAt || ""),
      updatedAt: String(data.updatedAt || ""),
    };
  } catch {
    return null;
  }
}

export async function writeClientSession(config, session) {
  const path = clientSessionPath(config);
  await mkdir(dirname(path), { recursive: true });
  const payload = {
    version: 1,
    gatewayUrl: String(session.gatewayUrl || "").replace(/\/+$/, ""),
    clientToken: String(session.clientToken || ""),
    clientId: String(session.clientId || ""),
    hostLabel: String(session.hostLabel || ""),
    scopes: Array.isArray(session.scopes) ? session.scopes.map(String) : DEFAULT_CLIENT_SCOPES.slice(),
    pairedAt: String(session.pairedAt || nowIso()),
    updatedAt: nowIso(),
  };
  if (!payload.gatewayUrl || !payload.clientToken) {
    throw new Error("client session requires gatewayUrl and clientToken");
  }
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return { path, session: payload };
}

export async function clearClientSession(config) {
  const path = clientSessionPath(config);
  try {
    await writeFile(path, `${JSON.stringify({ version: 1, clearedAt: nowIso() }, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // ignore
  }
  return { path, cleared: true };
}

export function createPairingCode(store, options = {}) {
  const ttlMs = Number(options.ttlMs || DEFAULT_PAIRING_TTL_MS);
  const advertiseUrl = normalizeGatewayUrl(options.advertiseUrl || options.gatewayUrl || "");
  if (!advertiseUrl) {
    throw new Error("advertiseUrl is required to create a pairing code");
  }
  const id = randomId("code");
  const body = randomCodeBody(8);
  const code = formatPairingCode(body);
  const createdAt = Date.now();
  const expiresAt = createdAt + Math.max(30_000, ttlMs);
  const record = {
    id,
    code,
    codeHash: hashSecret(body),
    advertiseUrl,
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    expiresAtMs: expiresAt,
    consumedAt: "",
    label: String(options.label || "").trim(),
  };
  const codes = { ...store.codes, [id]: record };
  return {
    store: { ...store, codes },
    code: publicPairingCode(record),
    displayCode: composeDisplayCode(code, advertiseUrl),
  };
}

export function redeemPairingCode(store, displayOrCode, options = {}) {
  const parsed = parseDisplayCode(displayOrCode);
  if (!parsed.code) {
    return { ok: false, error: "invalid_code", message: "Pairing code is missing." };
  }
  const attemptsKey = String(options.attemptKey || "default");
  const failedAttempts = { ...(store.failedAttempts || {}) };
  const attemptState = failedAttempts[attemptsKey] || { count: 0, windowedUntilMs: 0 };
  if (attemptState.windowedUntilMs > Date.now()) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Too many failed pairing attempts. Try again shortly.",
      retryAfterMs: attemptState.windowedUntilMs - Date.now(),
    };
  }

  const match = Object.values(store.codes || {}).find((entry) => entry.codeHash === hashSecret(parsed.code));
  if (!match) {
    return {
      ok: false,
      error: "invalid_code",
      message: "Pairing code is invalid.",
      store: withFailedAttempt(store, attemptsKey),
    };
  }
  if (match.consumedAt) {
    return {
      ok: false,
      error: "code_used",
      message: "Pairing code was already used.",
      store: withFailedAttempt(store, attemptsKey),
    };
  }
  if (Date.parse(match.expiresAt) <= Date.now()) {
    return {
      ok: false,
      error: "code_expired",
      message: "Pairing code expired.",
      store: withFailedAttempt(store, attemptsKey),
    };
  }

  const gatewayUrl = normalizeGatewayUrl(parsed.gatewayUrl || match.advertiseUrl);
  if (!gatewayUrl) {
    return { ok: false, error: "missing_host", message: "Pairing code is missing a host URL." };
  }

  const token = randomToken();
  const clientId = randomId("client");
  const now = nowIso();
  const client = {
    id: clientId,
    label: String(options.clientLabel || options.label || "client").trim() || "client",
    tokenHash: hashSecret(token),
    tokenPrefix: token.slice(0, 8),
    scopes: normalizeScopes(options.scopes || DEFAULT_CLIENT_SCOPES),
    createdAt: now,
    lastSeenAt: now,
    revokedAt: "",
    pairedFrom: String(options.pairedFrom || ""),
  };

  const codes = {
    ...store.codes,
    [match.id]: {
      ...match,
      consumedAt: now,
    },
  };
  const clients = {
    ...store.clients,
    [clientId]: client,
  };
  const nextFailed = { ...(store.failedAttempts || {}) };
  delete nextFailed[attemptsKey];

  return {
    ok: true,
    store: {
      ...store,
      codes,
      clients,
      failedAttempts: nextFailed,
    },
    client: publicClient(client),
    session: {
      gatewayUrl,
      clientToken: token,
      clientId,
      hostLabel: String(options.hostLabel || ""),
      scopes: client.scopes,
      pairedAt: now,
    },
  };
}

export function listClients(store) {
  return Object.values(store.clients || {})
    .filter((client) => !client.revokedAt)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((client) => publicClient(client));
}

export function listPairingCodes(store) {
  const now = Date.now();
  return Object.values(store.codes || {})
    .filter((code) => !code.consumedAt && Date.parse(code.expiresAt) > now)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((code) => publicPairingCode(code));
}

export function revokeClient(store, clientId) {
  const id = String(clientId || "");
  const existing = store.clients?.[id];
  if (!existing || existing.revokedAt) {
    return { store, revoked: null };
  }
  const clients = {
    ...store.clients,
    [id]: {
      ...existing,
      revokedAt: nowIso(),
    },
  };
  return { store: { ...store, clients }, revoked: publicClient(clients[id]) };
}

export function revokeAllClients(store) {
  const now = nowIso();
  const clients = Object.fromEntries(
    Object.entries(store.clients || {}).map(([id, client]) => [
      id,
      client.revokedAt ? client : { ...client, revokedAt: now },
    ]),
  );
  const revokedIds = Object.values(clients)
    .filter((client) => client.revokedAt === now)
    .map((client) => client.id);
  return { store: { ...store, clients }, revokedIds };
}

export function authenticateClientToken(store, token) {
  const value = String(token || "").trim();
  if (!value) {
    return null;
  }
  const tokenHash = hashSecret(value);
  const client = Object.values(store.clients || {}).find((entry) => entry.tokenHash === tokenHash && !entry.revokedAt);
  if (!client) {
    return null;
  }
  return publicClient(client);
}

export function touchClient(store, clientId) {
  const existing = store.clients?.[clientId];
  if (!existing || existing.revokedAt) {
    return store;
  }
  return {
    ...store,
    clients: {
      ...store.clients,
      [clientId]: {
        ...existing,
        lastSeenAt: nowIso(),
      },
    },
  };
}

export function composeDisplayCode(code, gatewayUrl) {
  const url = new URL(normalizeGatewayUrl(gatewayUrl));
  const hostPort = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  return `${formatPairingCode(code)}@${hostPort}`;
}

export function parseDisplayCode(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { code: "", gatewayUrl: "" };
  }
  const at = raw.lastIndexOf("@");
  if (at < 0) {
    return { code: normalizeCodeBody(raw), gatewayUrl: "" };
  }
  const code = normalizeCodeBody(raw.slice(0, at));
  const hostPart = raw.slice(at + 1).trim();
  if (!hostPart) {
    return { code, gatewayUrl: "" };
  }
  if (/^https?:\/\//i.test(hostPart)) {
    return { code, gatewayUrl: normalizeGatewayUrl(hostPart) };
  }
  return { code, gatewayUrl: normalizeGatewayUrl(`http://${hostPart}`) };
}

export function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "host" || mode === "client") {
    return mode;
  }
  return "";
}

export function hashSecret(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function withFailedAttempt(store, attemptsKey) {
  const failedAttempts = { ...(store.failedAttempts || {}) };
  const current = failedAttempts[attemptsKey] || { count: 0, windowedUntilMs: 0 };
  const count = Number(current.count || 0) + 1;
  const windowedUntilMs = count >= 5 ? Date.now() + 60_000 : 0;
  failedAttempts[attemptsKey] = { count, windowedUntilMs };
  return { ...store, failedAttempts };
}

function emptyPairingStore(path) {
  return { path, codes: {}, clients: {}, failedAttempts: {} };
}

function normalizePairingStore(data, path) {
  const codes = {};
  for (const [id, value] of Object.entries(data?.codes || {})) {
    const normalized = normalizePairingCode(id, value);
    if (normalized) {
      codes[normalized.id] = normalized;
    }
  }
  const clients = {};
  for (const [id, value] of Object.entries(data?.clients || {})) {
    const normalized = normalizeClient(id, value);
    if (normalized) {
      clients[normalized.id] = normalized;
    }
  }
  return {
    path,
    codes,
    clients,
    failedAttempts: data?.failedAttempts && typeof data.failedAttempts === "object" ? data.failedAttempts : {},
  };
}

function normalizePairingCode(id, value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const codeHash = String(value.codeHash || "");
  const advertiseUrl = normalizeGatewayUrl(value.advertiseUrl || value.gatewayUrl || "");
  if (!codeHash || !advertiseUrl) {
    return null;
  }
  return {
    id: String(value.id || id),
    code: String(value.code || ""),
    codeHash,
    advertiseUrl,
    createdAt: String(value.createdAt || ""),
    expiresAt: String(value.expiresAt || ""),
    expiresAtMs: Date.parse(value.expiresAt || "") || 0,
    consumedAt: String(value.consumedAt || ""),
    label: String(value.label || ""),
  };
}

function normalizeClient(id, value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const tokenHash = String(value.tokenHash || "");
  if (!tokenHash) {
    return null;
  }
  return {
    id: String(value.id || id),
    label: String(value.label || "client"),
    tokenHash,
    tokenPrefix: String(value.tokenPrefix || ""),
    scopes: normalizeScopes(value.scopes || DEFAULT_CLIENT_SCOPES),
    createdAt: String(value.createdAt || ""),
    lastSeenAt: String(value.lastSeenAt || ""),
    revokedAt: String(value.revokedAt || ""),
    pairedFrom: String(value.pairedFrom || ""),
  };
}

function serializePairingCode(code) {
  return {
    id: code.id,
    code: code.consumedAt ? "" : code.code,
    codeHash: code.codeHash,
    advertiseUrl: code.advertiseUrl,
    createdAt: code.createdAt,
    expiresAt: code.expiresAt,
    consumedAt: code.consumedAt || "",
    label: code.label || "",
  };
}

function serializeClient(client) {
  return {
    id: client.id,
    label: client.label,
    tokenHash: client.tokenHash,
    tokenPrefix: client.tokenPrefix,
    scopes: client.scopes,
    createdAt: client.createdAt,
    lastSeenAt: client.lastSeenAt,
    revokedAt: client.revokedAt || "",
    pairedFrom: client.pairedFrom || "",
  };
}

function publicPairingCode(code) {
  return {
    id: code.id,
    code: code.code,
    displayCode: code.code ? composeDisplayCode(code.code, code.advertiseUrl) : "",
    advertiseUrl: code.advertiseUrl,
    createdAt: code.createdAt,
    expiresAt: code.expiresAt,
    consumedAt: code.consumedAt || "",
    label: code.label || "",
  };
}

function publicClient(client) {
  return {
    id: client.id,
    label: client.label,
    tokenPrefix: client.tokenPrefix,
    scopes: client.scopes,
    createdAt: client.createdAt,
    lastSeenAt: client.lastSeenAt,
    revokedAt: client.revokedAt || "",
    pairedFrom: client.pairedFrom || "",
  };
}

function normalizeScopes(scopes) {
  const allowed = new Set(["models:use", "catalog:read", "admin"]);
  const list = Array.isArray(scopes) ? scopes : DEFAULT_CLIENT_SCOPES;
  const normalized = [...new Set(list.map((scope) => String(scope || "").trim()).filter((scope) => allowed.has(scope)))];
  return normalized.length ? normalized : DEFAULT_CLIENT_SCOPES.slice();
}

function normalizeGatewayUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    if (!/^https?:$/.test(url.protocol)) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

function formatPairingCode(body) {
  const normalized = normalizeCodeBody(body);
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

function normalizeCodeBody(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function randomCodeBody(length) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function randomToken() {
  return randomBytes(32).toString("hex");
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function runtimeHome(config) {
  return expandHome(config?.runtime?.home || "~/.shimex");
}

function nowIso() {
  return new Date().toISOString();
}
