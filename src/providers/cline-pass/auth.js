import { readFile, writeFile, chmod } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";

const DEFAULT_PROVIDER_SETTINGS = "~/.cline/data/settings/providers.json";
const CLINE_PASS_API_BASE_URL = "https://api.cline.bot/api/v1";

export async function clinePassAccessToken(options = {}) {
  const refreshed = await refreshClinePassAuth(options);
  if (refreshed) {
    return withWorkosPrefix(refreshed);
  }
  const token = await readClinePassAccessToken(options);
  return token ? withWorkosPrefix(token) : "";
}

export async function readClinePassAccessToken(options = {}) {
  const auth = await readAuth(options);
  const token = auth?.accessToken;
  if (typeof token !== "string") {
    return "";
  }
  return stripWorkosPrefix(token.trim());
}

export async function refreshClinePassAuth(options = {}) {
  const path = providerSettingsPath(options);
  const data = await readProviderSettings(path);
  const auth = providerAuth(data);
  if (!auth) {
    return "";
  }
  if (!options.force && typeof auth.expiresAt === "number" && auth.expiresAt > (Date.now() + 300000)) {
    return stripWorkosPrefix(auth.accessToken || "");
  }
  if (typeof auth.refreshToken !== "string" || !auth.refreshToken.trim()) {
    return "";
  }
  const response = await (options.fetch || fetch)(`${CLINE_PASS_API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "shimex",
    },
    body: JSON.stringify({ refreshToken: auth.refreshToken.trim(), grantType: "refresh_token" }),
  });
  if (!response.ok) {
    return "";
  }
  const payload = await response.json();
  const tokenData = payload?.data;
  const access = tokenData?.accessToken;
  if (typeof access !== "string" || !access.trim()) {
    return "";
  }
  const nextAuth = {
    ...auth,
    accessToken: withWorkosPrefix(access.trim()),
    refreshToken: tokenData.refreshToken || auth.refreshToken,
  };
  const expiresAt = parseExpiresAt(tokenData.expiresAt);
  if (expiresAt) {
    nextAuth.expiresAt = expiresAt;
  }
  const accountId = tokenData.userInfo?.clineUserId || auth.accountId;
  if (accountId) {
    nextAuth.accountId = accountId;
  }
  data.providers.cline.settings.auth = nextAuth;
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  await chmod(path, 0o600).catch(() => {});
  return access.trim();
}

async function readAuth(options) {
  const data = await readProviderSettings(providerSettingsPath(options));
  return providerAuth(data);
}

async function readProviderSettings(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function providerAuth(data) {
  return data?.providers?.cline?.settings?.auth || null;
}

function providerSettingsPath(options) {
  return expandHome(options.providerSettingsPath || process.env.CLINE_PROVIDER_SETTINGS_PATH || DEFAULT_PROVIDER_SETTINGS);
}

function withWorkosPrefix(token) {
  return token.toLowerCase().startsWith("workos:") ? token : `workos:${token}`;
}

function stripWorkosPrefix(token) {
  return token.toLowerCase().startsWith("workos:") ? token.slice("workos:".length) : token;
}

function parseExpiresAt(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
