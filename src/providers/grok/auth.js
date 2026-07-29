import { readFile, writeFile } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";

const DEFAULT_GROK_AUTH = "~/.grok/auth.json";
const DEFAULT_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const REFRESH_SKEW_MS = 60_000;

export async function readGrokAuth(options = {}) {
  const path = expandHome(options.authPath || process.env.GROK_AUTH_PATH || DEFAULT_GROK_AUTH);
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const entry = pickAuthEntry(data);
  if (!entry) {
    return null;
  }
  const accessToken = String(entry.key || entry.access_token || entry.accessToken || "").trim();
  if (!accessToken) {
    return null;
  }
  return {
    path,
    storeKey: entry.storeKey,
    raw: data,
    entry: entry.value,
    accessToken,
    refreshToken: String(entry.refresh_token || entry.refreshToken || "").trim(),
    expiresAt: normalizeExpiresAt(entry.expires_at || entry.expiresAt),
    clientId: String(entry.oidc_client_id || entry.oidcClientId || entry.client_id || "").trim(),
    issuer: String(entry.oidc_issuer || entry.oidcIssuer || entry.issuer || "https://auth.x.ai").trim(),
    email: String(entry.email || "").trim(),
    userId: String(entry.user_id || entry.userId || "").trim(),
    teamId: String(entry.team_id || entry.teamId || "").trim(),
  };
}

export async function resolveGrokAuth(options = {}) {
  const auth = await readGrokAuth(options);
  if (!auth) {
    return null;
  }
  if (!isExpiringSoon(auth.expiresAt) || !auth.refreshToken || !auth.clientId) {
    return auth;
  }
  const refreshed = await refreshGrokAuth(auth, options);
  return refreshed || auth;
}

export async function refreshGrokAuth(auth, options = {}) {
  if (!auth?.refreshToken || !auth?.clientId) {
    return null;
  }
  const response = await (options.fetch || fetch)(tokenUrl(auth, options), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": "shimex",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
      client_id: auth.clientId,
    }).toString(),
  });
  if (!response.ok) {
    return null;
  }
  const token = await response.json();
  if (!token?.access_token) {
    return null;
  }
  const accessToken = String(token.access_token);
  const refreshToken = typeof token.refresh_token === "string" && token.refresh_token
    ? token.refresh_token
    : auth.refreshToken;
  const expiresIn = Number(token.expires_in || 21600);
  const expiresAt = normalizeExpiresAt(Date.now() + expiresIn * 1000) || jwtExpiresAt(accessToken);
  const nextEntry = {
    ...auth.entry,
    key: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  };
  const nextStore = {
    ...auth.raw,
    [auth.storeKey]: nextEntry,
  };
  try {
    await writeFile(auth.path, `${JSON.stringify(nextStore, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Auth still works for this process even if the cache write fails.
  }
  return {
    ...auth,
    raw: nextStore,
    entry: nextEntry,
    accessToken,
    refreshToken,
    expiresAt,
  };
}

function pickAuthEntry(data) {
  const entries = Object.entries(data)
    .map(([storeKey, value]) => ({ storeKey, value, ...(value && typeof value === "object" ? value : {}) }))
    .filter((entry) => String(entry.key || entry.access_token || entry.accessToken || "").trim());
  if (!entries.length) {
    return null;
  }
  entries.sort((a, b) => Date.parse(b.expires_at || b.expiresAt || 0) - Date.parse(a.expires_at || a.expiresAt || 0));
  return entries[0];
}

function tokenUrl(auth, options = {}) {
  if (options.tokenUrl) {
    return options.tokenUrl;
  }
  const issuer = String(auth.issuer || "https://auth.x.ai").replace(/\/$/, "");
  if (issuer === "https://auth.x.ai") {
    return DEFAULT_TOKEN_URL;
  }
  return `${issuer}/oauth2/token`;
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) {
    return false;
  }
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) {
    return false;
  }
  return time <= Date.now() + REFRESH_SKEW_MS;
}

function normalizeExpiresAt(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d+$/.test(trimmed)) return normalizeExpiresAt(Number(trimmed));
    const time = Date.parse(trimmed);
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const millis = value > 10_000_000_000 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function jwtExpiresAt(accessToken) {
  if (typeof accessToken !== "string") return "";
  const parts = accessToken.split(".");
  if (parts.length !== 3) return "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1] || "", "base64url").toString("utf8"));
    return normalizeExpiresAt(payload?.exp);
  } catch {
    return "";
  }
}
