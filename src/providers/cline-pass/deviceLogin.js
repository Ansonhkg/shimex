import { randomUUID } from "node:crypto";
import { clineAuthStorePath, maskAccountId, readClineAuths, upsertClineProfile, writeClineAuths } from "./authStore.js";

const CLINE_API_BASE_URL = "https://api.cline.bot";
const WORKOS_API_BASE_URL = "https://api.workos.com";
const WORKOS_CLIENT_ID = "client_01K3A541FN8TA3EPPHTD2325AR";
const DEVICE_AUTH_URL = `${WORKOS_API_BASE_URL}/user_management/authorize/device`;
const WORKOS_TOKEN_URL = `${WORKOS_API_BASE_URL}/user_management/authenticate`;
const CLINE_REGISTER_URL = `${CLINE_API_BASE_URL}/api/v1/auth/register`;
const DEFAULT_TIMEOUT_MS = 30000;
const CANCEL_MESSAGE = "Login cancelled";

const pendingClineDeviceLogins = new Map();

export async function startShimexClineDeviceLogin(clineProviderConfig, rootConfig, options = {}) {
  const fetcher = options.fetch || fetch;
  const response = await fetcher(DEVICE_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "shimex" },
    body: new URLSearchParams({ client_id: clientId(clineProviderConfig) }),
    signal: timeoutSignal(clineProviderConfig),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Cline WorkOS device authorization failed: ${response.status}${json.error_description ? ` - ${json.error_description}` : ""}`);
  if (!json.device_code || !json.user_code || !json.verification_uri) throw new Error("Invalid Cline WorkOS device authorization response.");

  const id = `cline_login_${randomUUID().replaceAll("-", "")}`;
  const abort = new AbortController();
  const login = {
    id,
    userCode: json.user_code,
    deviceCode: json.device_code,
    verificationUri: json.verification_uri,
    verificationUriComplete: json.verification_uri_complete || json.verification_uri,
    intervalSeconds: toPositiveNumber(json.interval, 5),
    expiresInSeconds: toPositiveNumber(json.expires_in, 300),
    expiresAt: new Date(Date.now() + toPositiveNumber(json.expires_in, 300) * 1000).toISOString(),
    status: "pending",
    error: null,
    abort,
    credentials: null,
    profile: typeof options.profile === "string" ? options.profile.trim() : "",
  };
  pendingClineDeviceLogins.set(id, login);
  runDeviceFlow(id, clineProviderConfig, options).catch((error) => {
    const current = pendingClineDeviceLogins.get(id);
    if (current) {
      current.status = "error";
      current.error = error instanceof Error ? error.message : String(error);
    }
  });
  return toStatus(login);
}

export function getShimexClineDeviceLogin(id) {
  const login = pendingClineDeviceLogins.get(id);
  return login ? toStatus(login) : null;
}

export function cancelShimexClineDeviceLogin(id) {
  const login = pendingClineDeviceLogins.get(id);
  if (!login) return false;
  login.abort.abort();
  pendingClineDeviceLogins.delete(id);
  return true;
}

export async function completeShimexClineDeviceLogin(id, clineProviderConfig, rootConfig) {
  const login = pendingClineDeviceLogins.get(id);
  if (!login) throw new Error("Cline device login not found.");
  if (login.status !== "complete" || !login.credentials) throw new Error(login.error || "Cline device login is not complete yet.");
  const credentials = login.credentials;
  const path = clineAuthStorePath(clineProviderConfig, rootConfig);
  const store = await readClineAuths(path);
  const profileName = login.profile || `cline-${maskAccountId(credentials.accountId).replace(/[^A-Za-z0-9]/g, "") || randomUUID().slice(0, 8)}`;
  const result = upsertClineProfile(store, profileName, {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    accountId: credentials.accountId,
    email: credentials.email,
    provider: "cline",
    label: login.profile || profileName,
    note: `added via Cline WorkOS device flow at ${new Date().toISOString()}`,
  });
  await writeClineAuths(path, { profiles: result.profiles, defaultProfile: result.defaultProfile });
  pendingClineDeviceLogins.delete(id);
  return { profile: result.profile, defaultProfile: result.defaultProfile, path, profileName };
}

function toStatus(login) {
  return {
    id: login.id,
    userCode: login.userCode,
    verificationUri: login.verificationUri,
    verificationUriComplete: login.verificationUriComplete,
    intervalSeconds: login.intervalSeconds,
    expiresAt: login.expiresAt,
    status: login.status,
    error: login.error,
    profile: login.profile || "",
  };
}

async function runDeviceFlow(id, clineProviderConfig, options) {
  const login = pendingClineDeviceLogins.get(id);
  if (!login) return;
  const fetcher = options.fetch || fetch;
  try {
    const workos = await pollWorkosTokens({
      fetcher,
      signal: login.abort.signal,
      clientId: clientId(clineProviderConfig),
      deviceCode: login.deviceCode,
      expiresInSeconds: login.expiresInSeconds,
      intervalSeconds: login.intervalSeconds,
      requestTimeoutMs: requestTimeoutMs(clineProviderConfig),
    });
    login.credentials = await registerWorkosTokens(workos, clineProviderConfig, fetcher);
    login.status = "complete";
    login.error = null;
  } catch (error) {
    login.status = "error";
    login.error = error instanceof Error ? error.message : String(error);
  }
}

async function pollWorkosTokens({ fetcher, signal, clientId, deviceCode, expiresInSeconds, intervalSeconds, requestTimeoutMs }) {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let intervalMs = Math.max(1000, intervalSeconds * 1000);
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error(CANCEL_MESSAGE);
    const response = await fetcher(WORKOS_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "shimex" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode, client_id: clientId }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (!payload.access_token || !payload.refresh_token) throw new Error("Invalid Cline WorkOS token response.");
      return { accessToken: payload.access_token, refreshToken: payload.refresh_token, tokenType: payload.token_type || "Bearer" };
    }
    if (payload.error === "authorization_pending") {
      await abortableSleep(Math.min(intervalMs, deadline - Date.now()), signal);
      continue;
    }
    if (payload.error === "slow_down") {
      intervalMs += 1000;
      await abortableSleep(Math.min(intervalMs, deadline - Date.now()), signal);
      continue;
    }
    throw new Error(payload.error_description || `Cline WorkOS token polling failed: ${response.status}`);
  }
  throw new Error("Cline WorkOS device authorization timed out.");
}

async function registerWorkosTokens(workos, clineProviderConfig, fetcher) {
  const response = await fetcher(registerUrl(clineProviderConfig), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "shimex", ...basicHeaders(clineProviderConfig) },
    body: JSON.stringify({ accessToken: workos.accessToken, refreshToken: workos.refreshToken }),
    signal: timeoutSignal(clineProviderConfig),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Cline token registration failed: ${response.status}${payload.error_description ? ` - ${payload.error_description}` : ""}`);
  const data = payload.data;
  if (!data?.accessToken || !data.refreshToken) throw new Error("Invalid Cline token registration response.");
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt || "",
    accountId: data.userInfo?.clineUserId || "",
    email: data.userInfo?.email || "",
    tokenType: data.tokenType || "Bearer",
  };
}

function clientId(config) {
  return String(config?.options?.workos_client_id || config?.options?.workosClientId || WORKOS_CLIENT_ID);
}

function registerUrl(config) {
  const base = String(config?.options?.api_base_url || config?.options?.apiBaseUrl || CLINE_API_BASE_URL).replace(/\/$/, "");
  return `${base}/api/v1/auth/register`;
}

function requestTimeoutMs(config) {
  return Number(config?.options?.request_timeout_ms || config?.options?.requestTimeoutMs || DEFAULT_TIMEOUT_MS);
}

function timeoutSignal(config) {
  return AbortSignal.timeout(requestTimeoutMs(config));
}

function basicHeaders(config) {
  const value = config?.options?.headers;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error(CANCEL_MESSAGE));
    const timeout = setTimeout(resolve, Math.max(0, ms));
    signal.addEventListener("abort", () => { clearTimeout(timeout); reject(new Error(CANCEL_MESSAGE)); }, { once: true });
  });
}
