import { readFile, writeFile, chmod } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";
import { clineAuthStorePath, readClineAuths, writeClineAuths, stripWorkosPrefix, withWorkosPrefix } from "./authStore.js";

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

export async function clinePassProfileAccessToken(profile, providerConfig, rootConfig, options = {}) {
  const auth = await ensureFreshClineProfile(profile, providerConfig, rootConfig, options);
  return auth?.accessToken ? withWorkosPrefix(auth.accessToken) : "";
}

export async function ensureFreshClineProfile(profile, providerConfig, rootConfig, options = {}) {
  if (!profile?.accessToken) return null;
  if (!shouldRefreshProfile(profile, options)) return profile;
  if (!profile.refreshToken) return profile;
  try {
    return await refreshClineProfileAuth(profile, providerConfig, rootConfig, options) || profile;
  } catch {
    return profile;
  }
}

export async function refreshClineProfileAuth(profile, providerConfig, rootConfig, options = {}) {
  const response = await (options.fetch || fetch)(authEndpointUrl(providerConfig, "/api/v1/auth/refresh"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "shimex",
    },
    body: JSON.stringify({ refreshToken: profile.refreshToken, grantType: "refresh_token" }),
  });
  if (!response.ok) return "";
  const payload = await response.json();
  const tokenData = payload?.data;
  const access = tokenData?.accessToken;
  if (typeof access !== "string" || !access.trim()) return "";
  const path = clineAuthStorePath(providerConfig, rootConfig);
  const store = await readClineAuths(path);
  const current = store.profiles[profile.name];
  if (current) {
    const expiresAt = parseExpiresAt(tokenData.expiresAt);
    store.profiles[profile.name] = {
      ...current,
      accessToken: stripWorkosPrefix(access.trim()),
      refreshToken: tokenData.refreshToken || current.refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : current.expiresAt,
      accountId: tokenData.userInfo?.clineUserId || current.accountId,
      email: tokenData.userInfo?.email || current.email,
      updatedAt: new Date().toISOString(),
    };
    await writeClineAuths(path, store);
  }
  return store.profiles[profile.name] || { ...profile, accessToken: stripWorkosPrefix(access.trim()) };
}

function shouldRefreshProfile(profile, options = {}) {
  if (options.force) return true;
  const expiresAt = Date.parse(profile.expiresAt || "");
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= Date.now() + 300000;
}

function apiBaseUrl(config) {
  return String(config?.options?.api_base_url || config?.options?.apiBaseUrl || CLINE_PASS_API_BASE_URL).replace(/\/$/, "");
}

function authEndpointUrl(config, endpoint) {
  const base = apiBaseUrl(config);
  if (base.endsWith("/api/v1")) return `${base}${endpoint.replace(/^\/api\/v1/, "")}`;
  return `${base}${endpoint}`;
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
