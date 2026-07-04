import { readFile } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";

const DEFAULT_CODEX_AUTH = "~/.codex/auth.json";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE_URL = "https://auth.openai.com";
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`;

export async function readCodexAuth(options = {}) {
  const path = expandHome(options.authPath || process.env.CODEX_AUTH_PATH || DEFAULT_CODEX_AUTH);
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  const tokens = data?.tokens;
  if (!tokens?.access_token) {
    return null;
  }
  const accessToken = tokens.access_token;
  return {
    accessToken,
    accountId: tokens.account_id || "",
    refreshToken: tokens.refresh_token || "",
    idToken: tokens.id_token || "",
    expiresAt: normalizeExpiresAt(tokens.expires_at || tokens.expires || tokens.expiresAt) || jwtExpiresAt(accessToken),
    tokenType: tokens.token_type || "Bearer",
  };
}

export async function refreshCodexProfileAuth(profile, options = {}) {
  if (!profile?.refreshToken) return null;
  const response = await (options.fetch || fetch)(tokenUrl(options), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "shimex" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: options.clientId || CLIENT_ID,
      refresh_token: profile.refreshToken,
    }).toString(),
  });
  if (!response.ok) return null;
  const token = await response.json();
  if (!token?.access_token) return null;
  const accessToken = String(token.access_token);
  const expiresIn = Number(token.expires_in || 3600);
  const expiresAt = normalizeExpiresAt(Date.now() + expiresIn * 1000) || jwtExpiresAt(accessToken);
  return {
    ...profile,
    accessToken,
    refreshToken: typeof token.refresh_token === "string" && token.refresh_token ? token.refresh_token : profile.refreshToken,
    idToken: typeof token.id_token === "string" ? token.id_token : profile.idToken || "",
    expiresAt,
    tokenType: typeof token.token_type === "string" ? token.token_type : profile.tokenType || "Bearer",
    scope: typeof token.scope === "string" ? token.scope : profile.scope || "",
    accountId: getAccountId(accessToken) || profile.accountId || "",
    updatedAt: new Date().toISOString(),
  };
}

function tokenUrl(options = {}) {
  const base = String(options.authBaseUrl || AUTH_BASE_URL).replace(/\/$/, "");
  return options.tokenUrl || `${base}/oauth/token`;
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
  const payload = decodeJwt(accessToken);
  return normalizeExpiresAt(payload?.exp);
}

function getAccountId(accessToken) {
  const payload = decodeJwt(accessToken);
  const auth = payload?.["https://api.openai.com/auth"];
  return typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : "";
}

function decodeJwt(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1] || "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
