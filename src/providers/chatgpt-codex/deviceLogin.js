import { randomUUID } from "node:crypto";
import { authStorePath, maskAccountId, readCodexAuths, upsertProfile, writeCodexAuths } from "./authStore.js";

const DEVICE_CODE_TIMEOUT_SECONDS = 15 * 60;
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const SCOPE = "openid profile email offline_access";
const AUTH_BASE_URL = "https://auth.openai.com";
const DEVICE_USER_CODE_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/token`;
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`;
const DEVICE_VERIFICATION_URI = `${AUTH_BASE_URL}/codex/device`;
const DEVICE_REDIRECT_URI = `${AUTH_BASE_URL}/deviceauth/callback`;
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const MINIMUM_INTERVAL_MS = 1000;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_INTERVAL_INCREMENT_MS = 5000;
const CANCEL_MESSAGE = "Login cancelled";
const TIMEOUT_MESSAGE = "Device flow timed out";
const SLOW_DOWN_TIMEOUT_MESSAGE = "Device flow timed out after slow_down responses.";

const pendingDeviceLogins = new Map();

export async function startShimexCodexDeviceLogin(codexProviderConfig, rootConfig, options = {}) {
  const fetcher = options.fetch || fetch;
  const response = await fetcher(DEVICE_USER_CODE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "shimex" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    const message = response.status === 404
      ? "OpenAI Codex device code login is not enabled. Use paste or browser login."
      : `OpenAI Codex device code request failed with status ${response.status}${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`;
    throw new Error(message);
  }
  const json = await response.json();
  const intervalSeconds = typeof json?.interval === "string" ? Number(json.interval.trim()) : json?.interval;
  if (!json?.device_auth_id
    || !json.user_code
    || typeof intervalSeconds !== "number"
    || !Number.isFinite(intervalSeconds)
    || intervalSeconds < 0) {
    throw new Error(`Invalid OpenAI Codex device code response: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const id = `codex_login_${randomUUID().replaceAll("-", "")}`;
  const abort = new AbortController();
  const login = {
    id,
    userCode: json.user_code,
    deviceAuthId: json.device_auth_id,
    intervalSeconds,
    verificationUri: DEVICE_VERIFICATION_URI,
    redirectUri: DEVICE_REDIRECT_URI,
    expiresAt: new Date(Date.now() + DEVICE_CODE_TIMEOUT_SECONDS * 1000).toISOString(),
    status: "pending",
    error: null,
    abort,
    credentials: null,
    profile: typeof options.profile === "string" ? options.profile.trim() : "",
  };
  pendingDeviceLogins.set(id, login);
  runDeviceFlow(id, codexProviderConfig, rootConfig, options).catch((error) => {
    const current = pendingDeviceLogins.get(id);
    if (current) {
      current.status = "error";
      current.error = error instanceof Error ? error.message : String(error);
    }
  });
  return toStatus(login);
}

export function getShimexCodexDeviceLogin(id) {
  const login = pendingDeviceLogins.get(id);
  return login ? toStatus(login) : null;
}

export function cancelShimexCodexDeviceLogin(id) {
  const login = pendingDeviceLogins.get(id);
  if (!login) return false;
  login.abort.abort();
  pendingDeviceLogins.delete(id);
  return true;
}

export async function completeShimexCodexDeviceLogin(id, codexProviderConfig, rootConfig) {
  const login = pendingDeviceLogins.get(id);
  if (!login) {
    throw new Error("Codex device login not found.");
  }
  if (login.status !== "complete" || !login.credentials) {
    throw new Error(login.error || "Codex device login is not complete yet.");
  }
  const credentials = login.credentials;
  const path = authStorePath(codexProviderConfig, rootConfig);
  const store = await readCodexAuths(path);
  const profileName = login.profile || `personal-${maskAccountId(credentials.accountId).replace(/[^A-Za-z0-9]/g, "") || randomUUID().slice(0, 8)}`;
  const payload = {
    tokens: {
      access_token: credentials.access,
      refresh_token: credentials.refresh,
      id_token: credentials.idToken,
      expires: credentials.expires,
      account_id: credentials.accountId,
    },
    label: login.profile || profileName,
    note: `added via OpenAI Codex device flow at ${new Date().toISOString()}`,
  };
  const result = upsertProfile(store, profileName, payload);
  await writeCodexAuths(path, { profiles: result.profiles, defaultProfile: result.defaultProfile });
  pendingDeviceLogins.delete(id);
  return { profile: result.profile, defaultProfile: result.defaultProfile, path, profileName };
}

function toStatus(login) {
  return {
    id: login.id,
    userCode: login.userCode,
    verificationUri: login.verificationUri,
    intervalSeconds: login.intervalSeconds,
    expiresAt: login.expiresAt,
    status: login.status,
    error: login.error,
    profile: login.profile || "",
  };
}

async function runDeviceFlow(id, codexProviderConfig, rootConfig, options) {
  const login = pendingDeviceLogins.get(id);
  if (!login) return;
  const fetcher = options.fetch || fetch;
  try {
    const credentials = await pollDeviceCode({
      signal: login.abort.signal,
      intervalSeconds: login.intervalSeconds,
      expiresInSeconds: DEVICE_CODE_TIMEOUT_SECONDS,
      poll: async () => {
        const response = await fetcher(DEVICE_TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", "user-agent": "shimex" },
          body: JSON.stringify({ device_auth_id: login.deviceAuthId, user_code: login.userCode }),
        });
        if (response.ok) {
          const json = await response.json();
          if (!json?.authorization_code || !json.code_verifier) {
            return { status: "failed", message: `Invalid auth token response: ${JSON.stringify(json).slice(0, 200)}` };
          }
          return {
            status: "complete",
            value: await exchangeAuthorizationCodeForCredentials(json.authorization_code, json.code_verifier, login.redirectUri, fetcher),
          };
        }
        // OpenAI's device-auth endpoint returns 403 with one of several JSON
        // error codes during a normal sign-in flow:
        //   deviceauth_authorization_pending - keep polling
        //   deviceauth_slow_down             - bump interval, keep polling
        //   deviceauth_authorization_declined, deviceauth_expired_token,
        //   deviceauth_invalid_client, ...   - real failure
        // Some older responses also return 200 with { status: "pending" } and
        // 404 is also a "still pending" sign in some scripts. Treat every
        // non-200, non-explicit-failure response as "still pending".
        let errorText = "";
        try { errorText = await response.text(); } catch { errorText = ""; }
        let errorJson = null;
        if (errorText) {
          try { errorJson = JSON.parse(errorText); } catch { errorJson = null; }
        }
        const code = errorJson && (errorJson.code || errorJson.error?.code) || "";
        const message = errorJson && (errorJson.message || errorJson.error?.message) || errorText || "";
        if (code === "deviceauth_slow_down" || message.includes("slow_down")) {
          return { status: "slow_down" };
        }
        if (code === "deviceauth_authorization_pending" || message.includes("pending")) {
          return { status: "pending" };
        }
        if (
          code === "deviceauth_authorization_declined"
          || code === "deviceauth_expired_token"
          || code === "deviceauth_invalid_client"
          || code === "deviceauth_invalid_grant"
        ) {
          return { status: "failed", message: `device auth failed: ${message.slice(0, 200)}` };
        }
        if (response.status === 404 || response.status === 408 || response.status === 425 || response.status === 429 || response.status === 503) {
          return { status: "pending" };
        }
        if (response.status >= 500) {
          return { status: "pending" };
        }
        // 403 without a recognised code, or any other 4xx — assume still
        // polling on long-running device flows and let the timeout catch a
        // genuinely stuck request.
        if (response.status >= 400 && response.status < 500) {
          return { status: "pending" };
        }
        return { status: "failed", message: `device token request failed with status ${response.status}: ${errorText.slice(0, 200)}` };
      },
    });
    login.credentials = credentials;
    login.status = "complete";
    login.error = null;
  } catch (error) {
    login.status = "error";
    login.error = error instanceof Error ? error.message : String(error);
  }
}

async function pollDeviceCode({ signal, intervalSeconds, expiresInSeconds, poll }) {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let slowDownResponses = 0;
  let intervalMs = Math.max(MINIMUM_INTERVAL_MS, Math.floor((intervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS) * 1000));
  while (Date.now() < deadline) {
    if (signal && signal.aborted) throw new Error(CANCEL_MESSAGE);
    const result = await poll();
    if (result.status === "complete") return result.value;
    if (result.status === "failed") throw new Error(result.message || "device flow failed");
    if (result.status === "slow_down") {
      slowDownResponses += 1;
      intervalMs = Math.max(MINIMUM_INTERVAL_MS, intervalMs + SLOW_DOWN_INTERVAL_INCREMENT_MS);
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await abortableSleep(Math.min(intervalMs, remainingMs), signal, CANCEL_MESSAGE);
  }
  if (slowDownResponses > 0) throw new Error(SLOW_DOWN_TIMEOUT_MESSAGE);
  throw new Error(TIMEOUT_MESSAGE);
}

async function exchangeAuthorizationCodeForCredentials(code, verifier, redirectUri, fetcher) {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "shimex" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`authorization code exchange failed with status ${response.status}: ${text.slice(0, 200)}`);
  }
  const token = await response.json();
  if (!token?.access_token || !token?.refresh_token) {
    throw new Error(`authorization response missing tokens: ${JSON.stringify(token).slice(0, 200)}`);
  }
  const expiresIn = Number(token.expires_in || 3600);
  const expires = Date.now() + expiresIn * 1000;
  const accessToken = String(token.access_token);
  const accountId = getAccountId(accessToken);
  return {
    access: accessToken,
    refresh: String(token.refresh_token),
    idToken: typeof token.id_token === "string" ? token.id_token : "",
    expires,
    expiresIn,
    accountId,
    scope: typeof token.scope === "string" ? token.scope : SCOPE,
    tokenType: typeof token.token_type === "string" ? token.token_type : "Bearer",
  };
}

function abortableSleep(ms, signal, cancelMessage) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new Error(cancelMessage));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error(cancelMessage));
    };
    const timeout = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getAccountId(accessToken) {
  const payload = decodeJwt(accessToken);
  const auth = payload && payload[JWT_CLAIM_PATH];
  const accountId = auth && auth.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : "";
}

function decodeJwt(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1] || "";
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
