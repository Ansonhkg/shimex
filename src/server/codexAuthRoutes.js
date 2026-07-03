import { loadAuthStore } from "../providers/chatgpt-codex/index.js";
import {
  authStorePath,
  listProfileSummaries,
  maskAccountId,
  renameProfile,
  removeProfile,
  resolveProfileForSlug,
  setDefaultProfile,
  upsertProfile,
  writeCodexAuths,
} from "../providers/chatgpt-codex/authStore.js";
import {
  completeShimexCodexDeviceLogin,
  cancelShimexCodexDeviceLogin,
  getShimexCodexDeviceLogin,
  startShimexCodexDeviceLogin,
} from "../providers/chatgpt-codex/deviceLogin.js";

const CHATGPT_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CHATGPT_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export function createCodexAuthRoutes(config) {
  const codexProviderConfig = () =>
    config.providers && config.providers.find((provider) => provider.id === "chatgpt-codex") || { id: "chatgpt-codex", options: {} };

  async function listProfiles() {
    return await loadAuthStore(codexProviderConfig(), config);
  }

  return {
    async route(request, url, options = {}) {
      const path = url.pathname;
      const method = request.method || "GET";

      if (path === "/api/codex-auths") {
        if (method === "GET") return await handleList(listProfiles, codexProviderConfig, config);
        if (method === "POST") return await handleAdd(request, listProfiles, codexProviderConfig, config);
        return methodNotAllowed(["GET", "POST"]);
      }
      if (path === "/api/codex-auths/start-device") {
        return await handleStartDevice(request, codexProviderConfig, config, options);
      }
      const completeMatch = path.match(/^\/api\/codex-auths\/device\/([^/]+)\/complete$/);
      if (completeMatch) return await handleDeviceComplete(decodeURIComponent(completeMatch[1]), codexProviderConfig, config);
      const cancelMatch = path.match(/^\/api\/codex-auths\/device\/([^/]+)\/cancel$/);
      if (cancelMatch) return await handleDeviceCancel(decodeURIComponent(cancelMatch[1]));
      const statusMatch = path.match(/^\/api\/codex-auths\/device\/([^/]+)$/);
      if (statusMatch) return await handleDeviceStatus(decodeURIComponent(statusMatch[1]));
      const useMatch = path.match(/^\/api\/codex-auths\/([^/]+)\/use$/);
      if (useMatch) return await handleUse(decodeURIComponent(useMatch[1]), listProfiles, codexProviderConfig, config, method);
      const renameMatch = path.match(/^\/api\/codex-auths\/([^/]+)\/rename$/);
      if (renameMatch) return await handleRename(decodeURIComponent(renameMatch[1]), request, listProfiles, codexProviderConfig, config, method);
      const usageMatch = path.match(/^\/api\/codex-auths\/([^/]+)\/usage$/);
      if (usageMatch) return await handleUsage(decodeURIComponent(usageMatch[1]), codexProviderConfig, config, options, method);
      const creditsMatch = path.match(/^\/api\/codex-auths\/([^/]+)\/credits$/);
      if (creditsMatch) return await handleCredits(decodeURIComponent(creditsMatch[1]), codexProviderConfig, config, options, method);
      const profileMatch = path.match(/^\/api\/codex-auths\/([^/]+)$/);
      if (profileMatch) return await handleRemove(decodeURIComponent(profileMatch[1]), listProfiles, codexProviderConfig, config, method);
      return null;
    },
  };
}

async function handleList(listProfiles, codexProviderConfig, config) {
  const store = await listProfiles();
  const path = authStorePath(codexProviderConfig(), config);
  return json({
    path,
    defaultProfile: store.defaultProfile,
    profiles: listProfileSummaries(store),
  });
}

async function handleRename(profileName, request, listProfiles, codexProviderConfig, config, method) {
  if (method !== "POST") return methodNotAllowed(["POST"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const body = await readJsonSafe(request);
  const nextName = String(body.name || body.to || body.profile || "").trim();
  if (!nextName) return json({ error: "new profile name is required" }, { status: 400 });
  const store = await listProfiles();
  const result = renameProfile(store, profileName, nextName);
  if (!result.renamed) {
    const status = result.reason === "missing-source" ? 404 : 400;
    return json({ error: renameErrorMessage(profileName, nextName, result.reason), reason: result.reason }, { status });
  }
  await writeStorePayload(codexProviderConfig(), config, { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({
    path: authStorePath(codexProviderConfig(), config),
    from: result.from,
    to: result.to,
    profile: publicProfile(result.profile),
    defaultProfile: result.defaultProfile,
  });
}

async function handleAdd(request, listProfiles, codexProviderConfig, config) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const rawBody = await readJsonSafe(request);
  const name = String(rawBody.name || rawBody.profile || "").trim();
  if (!name) {
    return json({ error: "name is required" }, { status: 400 });
  }
  let payload = rawBody;
  if (typeof rawBody.auth_json === "string" && rawBody.auth_json.trim()) {
    try {
      payload = JSON.parse(rawBody.auth_json);
    } catch (error) {
      return json({ error: `auth_json is not valid JSON: ${String(error?.message || error)}` }, { status: 400 });
    }
  }
  const store = await listProfiles();
  let result;
  try {
    result = upsertProfile(store, name, payload);
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 400 });
  }
  await writeStorePayload(codexProviderConfig(), config, { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({
    path: authStorePath(codexProviderConfig(), config),
    profile: publicProfile(result.profile),
    defaultProfile: result.defaultProfile,
  });
}

async function handleRemove(profileName, listProfiles, codexProviderConfig, config, method) {
  if (method !== "DELETE") return methodNotAllowed(["DELETE"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await listProfiles();
  const result = removeProfile(store, profileName);
  if (!result.removed) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  await writeStorePayload(codexProviderConfig(), config, { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({
    path: authStorePath(codexProviderConfig(), config),
    removed: result.removed,
    defaultProfile: result.defaultProfile,
    remaining: listProfileSummaries({ profiles: result.profiles, defaultProfile: result.defaultProfile }),
  });
}

async function handleUse(profileName, listProfiles, codexProviderConfig, config, method) {
  if (method !== "POST") return methodNotAllowed(["POST"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await listProfiles();
  if (!store.profiles[profileName]) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  const next = setDefaultProfile(store, profileName);
  await writeStorePayload(codexProviderConfig(), config, { profiles: next.profiles, defaultProfile: next.defaultProfile });
  return json({
    path: authStorePath(codexProviderConfig(), config),
    defaultProfile: next.defaultProfile,
    changed: next.changed,
  });
}

async function handleStartDevice(request, codexProviderConfig, config, options) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  let body = {};
  try {
    body = await readJsonSafe(request);
  } catch {
    body = {};
  }
  const profile = typeof body.profile === "string" ? body.profile : "";
  try {
    const login = await startShimexCodexDeviceLogin(codexProviderConfig(), config, { profile, fetch: options.fetch });
    return json({ device: login });
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 502 });
  }
}

async function handleDeviceStatus(loginId) {
  const login = getShimexCodexDeviceLogin(loginId);
  if (!login) return json({ error: "device login not found or expired" }, { status: 404 });
  return json({ device: login });
}

async function handleDeviceComplete(loginId, codexProviderConfig, config) {
  if (!loginId) return json({ error: "device login id is required" }, { status: 400 });
  try {
    const result = await completeShimexCodexDeviceLogin(loginId, codexProviderConfig(), config);
    return json({
      path: result.path,
      defaultProfile: result.defaultProfile,
      profile: publicProfile(result.profile),
      profileName: result.profileName,
    });
  } catch (error) {
    const login = getShimexCodexDeviceLogin(loginId);
    const status = login && login.status === "pending" ? 409 : 400;
    return json({ error: String(error?.message || error), device: login || null }, { status });
  }
}

async function handleDeviceCancel(loginId) {
  if (!loginId) return json({ error: "device login id is required" }, { status: 400 });
  const cancelled = cancelShimexCodexDeviceLogin(loginId);
  if (!cancelled) return json({ error: "device login not found" }, { status: 404 });
  return json({ cancelled: true, id: loginId });
}

async function handleCredits(profileName, codexProviderConfig, config, options, method) {
  if (method !== "GET") return methodNotAllowed(["GET"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await loadAuthStore(codexProviderConfig(), config);
  const profile = store.profiles[profileName];
  if (!profile) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  const fetcher = options.fetch || fetch;
  let response;
  try {
    response = await fetcher(CHATGPT_RESET_CREDITS_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${profile.accessToken}`,
        "openai-account": profile.accountId || "",
        "openai-organization": profile.accountId || "",
        accept: "application/json",
        "user-agent": "shimex",
      },
    });
  } catch (error) {
    return json({ error: `upstream probe failed: ${String(error?.message || error)}` }, { status: 502 });
  }
  const text = await response.text();
  if (!response.ok) {
    return json({
      error: `upstream returned ${response.status}`,
      upstreamStatus: response.status,
    }, { status: 502 });
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "upstream body was not JSON" }, { status: 502 });
  }
  return json({
    profile: profile.name,
    available: typeof payload.available_count === "number" ? payload.available_count : null,
    totalEarned: typeof payload.total_earned_count === "number" ? payload.total_earned_count : null,
    credits: Array.isArray(payload.credits) ? payload.credits.map(normalizeCredit) : [],
  });
}

async function handleUsage(profileName, codexProviderConfig, config, options, method) {
  if (method !== "GET") return methodNotAllowed(["GET"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await loadAuthStore(codexProviderConfig(), config);
  const profile = store.profiles[profileName];
  if (!profile) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  const fetcher = options.fetch || fetch;
  let response;
  try {
    response = await fetcher(CHATGPT_USAGE_URL, {
      method: "GET",
      headers: usageHeaders(profile),
    });
  } catch (error) {
    return json({ error: `upstream usage probe failed: ${String(error?.message || error)}` }, { status: 502 });
  }
  const text = await response.text();
  if (!response.ok) {
    return json({
      error: `upstream returned ${response.status}`,
      upstreamStatus: response.status,
    }, { status: 502 });
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "upstream body was not JSON" }, { status: 502 });
  }
  return json(normalizeUsage(profile, payload));
}

async function writeStorePayload(codexProviderConfigValue, config, payload) {
  const path = authStorePath(codexProviderConfigValue, config);
  await writeCodexAuths(path, payload);
}

function publicProfile(profile) {
  return {
    name: profile.name,
    label: profile.label || profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    expiresAt: profile.expiresAt || "",
    expiresInSeconds: expiresInSeconds(profile.expiresAt),
    tokenExpired: tokenExpired(profile.expiresAt),
    note: profile.note || "",
    available: profile.available !== false,
    accountMasked: maskAccountId(profile.accountId),
  };
}

function usageHeaders(profile) {
  return {
    authorization: `Bearer ${profile.accessToken}`,
    "openai-account": profile.accountId || "",
    "openai-organization": profile.accountId || "",
    "chatgpt-account-id": profile.accountId || "",
    accept: "application/json",
    "user-agent": "shimex",
  };
}

function normalizeUsage(profile, payload) {
  const rateLimit = payload?.rate_limit && typeof payload.rate_limit === "object" ? payload.rate_limit : {};
  const credits = payload?.credits && typeof payload.credits === "object" ? payload.credits : {};
  return {
    profile: profile.name,
    planType: typeof payload?.plan_type === "string" ? payload.plan_type : "",
    allowed: rateLimit.allowed !== false,
    limitReached: Boolean(rateLimit.limit_reached),
    primaryWindow: normalizeUsageWindow(rateLimit.primary_window),
    secondaryWindow: normalizeUsageWindow(rateLimit.secondary_window),
    credits: {
      hasCredits: Boolean(credits.has_credits),
      unlimited: Boolean(credits.unlimited),
      balance: credits.balance == null ? "" : String(credits.balance),
      approxLocalMessages: Array.isArray(credits.approx_local_messages) ? credits.approx_local_messages : [],
      approxCloudMessages: Array.isArray(credits.approx_cloud_messages) ? credits.approx_cloud_messages : [],
    },
    resetCreditsAvailable: typeof payload?.rate_limit_reset_credits?.available_count === "number"
      ? payload.rate_limit_reset_credits.available_count
      : null,
    spendControlReached: Boolean(payload?.spend_control?.reached),
    rateLimitReachedType: payload?.rate_limit_reached_type || null,
  };
}

function normalizeUsageWindow(window) {
  if (!window || typeof window !== "object") return null;
  return {
    usedPercent: typeof window.used_percent === "number" ? window.used_percent : null,
    remainingPercent: typeof window.used_percent === "number" ? Math.max(0, 100 - window.used_percent) : null,
    limitWindowSeconds: typeof window.limit_window_seconds === "number" ? window.limit_window_seconds : null,
    resetAfterSeconds: typeof window.reset_after_seconds === "number" ? window.reset_after_seconds : null,
    resetAt: typeof window.reset_at === "number" ? window.reset_at : null,
    resetAtIso: typeof window.reset_at === "number" ? new Date(window.reset_at * 1000).toISOString() : "",
  };
}

function expiresInSeconds(expiresAt) {
  const time = Date.parse(expiresAt || "");
  if (!Number.isFinite(time)) return null;
  return Math.floor((time - Date.now()) / 1000);
}

function tokenExpired(expiresAt) {
  const seconds = expiresInSeconds(expiresAt);
  return seconds == null ? false : seconds <= 0;
}

function renameErrorMessage(from, to, reason) {
  if (reason === "missing-source") return `profile "${from}" not found`;
  if (reason === "invalid-target") return "new profile name must match [a-zA-Z0-9][a-zA-Z0-9._-]* and be 1-64 characters";
  if (reason === "target-exists") return `profile "${to}" already exists`;
  return "profile was not renamed";
}

function normalizeCredit(credit) {
  return {
    expiresAt: credit?.expires_at || null,
    status: credit?.status || "",
    grantedAt: credit?.granted_at || null,
    amount: typeof credit?.amount === "number" ? credit.amount : null,
  };
}

function methodNotAllowed(allowed) {
  return json(
    { error: `method not allowed; use ${allowed.join(", ")}` },
    { status: 405, headers: { allow: allowed.join(", ") } },
  );
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

async function readJsonSafe(request) {
  if (!request) return {};
  if (request.body == null && typeof request[Symbol.asyncIterator] !== "function") return {};
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`could not parse request body as JSON: ${error.message}`);
  }
}

export { resolveProfileForSlug };
