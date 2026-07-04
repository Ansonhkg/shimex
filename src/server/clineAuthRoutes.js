import { loadClineAuthStore } from "../providers/cline-pass/index.js";
import { ensureFreshClineProfile, refreshClineProfileAuth } from "../providers/cline-pass/auth.js";
import {
  clineAuthStorePath,
  listClineProfileSummaries,
  renameClineProfile,
  removeClineProfile,
  setDefaultClineProfile,
  upsertClineProfile,
  writeClineAuths,
  withWorkosPrefix,
} from "../providers/cline-pass/authStore.js";
import {
  cancelShimexClineDeviceLogin,
  completeShimexClineDeviceLogin,
  getShimexClineDeviceLogin,
  startShimexClineDeviceLogin,
} from "../providers/cline-pass/deviceLogin.js";

const CLINE_USAGE_LIMITS_URL = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";

export function createClineAuthRoutes(config) {
  const clineProviderConfig = () =>
    config.providers && config.providers.find((provider) => provider.id === "cline-pass") || { id: "cline-pass", options: {} };
  const listProfiles = async () => await loadClineAuthStore(clineProviderConfig(), config);
  return {
    async route(request, url, options = {}) {
      const path = url.pathname;
      const method = request.method || "GET";
      if (path === "/api/cline-auths") {
        if (method === "GET") return await handleList(listProfiles, clineProviderConfig, config, options);
        if (method === "POST") return await handleAdd(request, listProfiles, clineProviderConfig, config);
        return methodNotAllowed(["GET", "POST"]);
      }
      if (path === "/api/cline-auths/start-device") return await handleStartDevice(request, clineProviderConfig, config, options);
      const completeMatch = path.match(/^\/api\/cline-auths\/device\/([^/]+)\/complete$/);
      if (completeMatch) return await handleDeviceComplete(decodeURIComponent(completeMatch[1]), clineProviderConfig, config);
      const cancelMatch = path.match(/^\/api\/cline-auths\/device\/([^/]+)\/cancel$/);
      if (cancelMatch) return await handleDeviceCancel(decodeURIComponent(cancelMatch[1]));
      const statusMatch = path.match(/^\/api\/cline-auths\/device\/([^/]+)$/);
      if (statusMatch) return await handleDeviceStatus(decodeURIComponent(statusMatch[1]));
      const useMatch = path.match(/^\/api\/cline-auths\/([^/]+)\/use$/);
      if (useMatch) return await handleUse(decodeURIComponent(useMatch[1]), listProfiles, clineProviderConfig, config, method);
      const renameMatch = path.match(/^\/api\/cline-auths\/([^/]+)\/rename$/);
      if (renameMatch) return await handleRename(decodeURIComponent(renameMatch[1]), request, listProfiles, clineProviderConfig, config, method);
      const usageMatch = path.match(/^\/api\/cline-auths\/([^/]+)\/usage$/);
      if (usageMatch) return await handleUsage(decodeURIComponent(usageMatch[1]), clineProviderConfig, config, options, method);
      const renewMatch = path.match(/^\/api\/cline-auths\/([^/]+)\/renew$/);
      if (renewMatch) return await handleRenew(decodeURIComponent(renewMatch[1]), clineProviderConfig, config, options, method);
      const profileMatch = path.match(/^\/api\/cline-auths\/([^/]+)$/);
      if (profileMatch) return await handleRemove(decodeURIComponent(profileMatch[1]), listProfiles, clineProviderConfig, config, method);
      return null;
    },
  };
}

async function handleList(listProfiles, clineProviderConfig, config, options = {}) {
  const store = await refreshExpiringProfiles(await listProfiles(), clineProviderConfig(), config, options);
  return json({
    path: clineAuthStorePath(clineProviderConfig(), config),
    defaultProfile: store.defaultProfile,
    profiles: listClineProfileSummaries(store),
  });
}

async function handleAdd(request, listProfiles, clineProviderConfig, config) {
  const rawBody = await readJsonSafe(request);
  const name = String(rawBody.name || rawBody.profile || "").trim();
  if (!name) return json({ error: "name is required" }, { status: 400 });
  let payload = rawBody;
  if (typeof rawBody.auth_json === "string" && rawBody.auth_json.trim()) {
    try { payload = JSON.parse(rawBody.auth_json); } catch (error) { return json({ error: `auth_json is not valid JSON: ${String(error?.message || error)}` }, { status: 400 }); }
  }
  const store = await listProfiles();
  let result;
  try { result = upsertClineProfile(store, name, payload); } catch (error) { return json({ error: String(error?.message || error) }, { status: 400 }); }
  await writeClineAuths(clineAuthStorePath(clineProviderConfig(), config), { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({ path: clineAuthStorePath(clineProviderConfig(), config), profile: publicProfile(result.profile), defaultProfile: result.defaultProfile });
}

async function handleRename(profileName, request, listProfiles, clineProviderConfig, config, method) {
  if (method !== "POST") return methodNotAllowed(["POST"]);
  const body = await readJsonSafe(request);
  const nextName = String(body.name || body.to || body.profile || "").trim();
  if (!nextName) return json({ error: "new profile name is required" }, { status: 400 });
  const result = renameClineProfile(await listProfiles(), profileName, nextName);
  if (!result.renamed) return json({ error: renameErrorMessage(profileName, nextName, result.reason), reason: result.reason }, { status: result.reason === "missing-source" ? 404 : 400 });
  await writeClineAuths(clineAuthStorePath(clineProviderConfig(), config), { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({ path: clineAuthStorePath(clineProviderConfig(), config), from: result.from, to: result.to, profile: publicProfile(result.profile), defaultProfile: result.defaultProfile });
}

async function handleRemove(profileName, listProfiles, clineProviderConfig, config, method) {
  if (method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const result = removeClineProfile(await listProfiles(), profileName);
  if (!result.removed) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  await writeClineAuths(clineAuthStorePath(clineProviderConfig(), config), { profiles: result.profiles, defaultProfile: result.defaultProfile });
  return json({ path: clineAuthStorePath(clineProviderConfig(), config), removed: result.removed, defaultProfile: result.defaultProfile, remaining: listClineProfileSummaries({ profiles: result.profiles, defaultProfile: result.defaultProfile }) });
}

async function handleUse(profileName, listProfiles, clineProviderConfig, config, method) {
  if (method !== "POST") return methodNotAllowed(["POST"]);
  const store = await listProfiles();
  if (!store.profiles[profileName]) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  const next = setDefaultClineProfile(store, profileName);
  await writeClineAuths(clineAuthStorePath(clineProviderConfig(), config), { profiles: next.profiles, defaultProfile: next.defaultProfile });
  return json({ path: clineAuthStorePath(clineProviderConfig(), config), defaultProfile: next.defaultProfile, changed: next.changed });
}

async function handleStartDevice(request, clineProviderConfig, config, options) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const body = await readJsonSafe(request).catch(() => ({}));
  try {
    const profile = typeof body.profile === "string" ? body.profile : "";
    return json({ device: await startShimexClineDeviceLogin(clineProviderConfig(), config, { profile, fetch: options.fetch }) });
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 502 });
  }
}

function handleDeviceStatus(loginId) {
  const login = getShimexClineDeviceLogin(loginId);
  return login ? json({ device: login }) : json({ error: "device login not found or expired" }, { status: 404 });
}

async function handleDeviceComplete(loginId, clineProviderConfig, config) {
  try {
    const result = await completeShimexClineDeviceLogin(loginId, clineProviderConfig(), config);
    return json({ path: result.path, defaultProfile: result.defaultProfile, profile: publicProfile(result.profile), profileName: result.profileName });
  } catch (error) {
    const login = getShimexClineDeviceLogin(loginId);
    return json({ error: String(error?.message || error), device: login || null }, { status: login && login.status === "pending" ? 409 : 400 });
  }
}

function handleDeviceCancel(loginId) {
  const cancelled = cancelShimexClineDeviceLogin(loginId);
  return cancelled ? json({ cancelled: true, id: loginId }) : json({ error: "device login not found" }, { status: 404 });
}

async function handleUsage(profileName, clineProviderConfig, config, options, method) {
  if (method !== "GET") return methodNotAllowed(["GET"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await loadClineAuthStore(clineProviderConfig(), config);
  let profile = store.profiles[profileName];
  if (!profile) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  profile = await ensureFreshClineProfile(profile, clineProviderConfig(), config, { ...options, force: false });
  const fetcher = options.fetch || fetch;
  let response;
  try {
    response = await fetcher(usageLimitsUrl(clineProviderConfig()), {
      method: "GET",
      headers: {
        authorization: `Bearer ${withWorkosPrefix(profile.accessToken)}`,
        accept: "application/json",
        "user-agent": "shimex",
      },
    });
  } catch (error) {
    return json({ error: `upstream usage probe failed: ${String(error?.message || error)}` }, { status: 502 });
  }
  const text = await response.text();
  if (!response.ok) {
    return json({ error: `upstream returned ${response.status}`, upstreamStatus: response.status }, { status: 502 });
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "upstream body was not JSON" }, { status: 502 });
  }
  return json(normalizeClineUsage(profile.name, payload));
}

async function handleRenew(profileName, clineProviderConfig, config, options, method) {
  if (method !== "POST") return methodNotAllowed(["POST"]);
  if (!profileName) return json({ error: "profile name is required" }, { status: 400 });
  const store = await loadClineAuthStore(clineProviderConfig(), config);
  const profile = store.profiles[profileName];
  if (!profile) return json({ error: `profile "${profileName}" not found` }, { status: 404 });
  if (!profile.refreshToken) return json({ error: `profile "${profileName}" has no refresh token` }, { status: 400 });
  try {
    const renewed = await refreshClineProfileAuth(profile, clineProviderConfig(), config, { ...options, force: true });
    if (!renewed?.accessToken) return json({ error: "Cline token refresh did not return a new access token" }, { status: 502 });
    return json({ path: clineAuthStorePath(clineProviderConfig(), config), profile: publicProfile(renewed), renewed: true });
  } catch (error) {
    return json({ error: `Cline token refresh failed: ${String(error?.message || error)}` }, { status: 502 });
  }
}

async function refreshExpiringProfiles(store, clineProviderConfigValue, config, options) {
  let current = store;
  for (const profile of Object.values(store.profiles || {})) {
    const refreshed = await ensureFreshClineProfile(profile, clineProviderConfigValue, config, { ...options, force: false });
    if (refreshed && refreshed !== profile) {
      current = await loadClineAuthStore(clineProviderConfigValue, config);
    }
  }
  return current;
}

function normalizeClineUsage(profileName, payload) {
  const limits = Array.isArray(payload?.data?.limits) ? payload.data.limits : [];
  return {
    profile: profileName,
    limits: limits.flatMap(normalizeUsageLimit),
  };
}

function normalizeUsageLimit(limit) {
  if (!limit || typeof limit !== "object") return [];
  const type = typeof limit.type === "string" ? limit.type : "unknown";
  const usedPercent = clampPercent(limit.percentUsed);
  const remainingPercent = usedPercent == null ? null : Math.max(0, 100 - usedPercent);
  return [{
    type,
    label: usageLimitLabel(type),
    usedPercent,
    remainingPercent,
    resetAtIso: normalizeIsoDate(limit.resetsAt),
  }];
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function usageLimitLabel(type) {
  if (type === "five_hour") return "5h";
  if (type === "weekly") return "weekly";
  if (type === "monthly") return "monthly";
  return type.replaceAll("_", " ");
}

function normalizeIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function usageLimitsUrl(config) {
  const explicit = config?.options?.usage_limits_url || config?.options?.usageLimitsUrl;
  if (explicit) return String(explicit);
  const base = String(config?.options?.api_base_url || config?.options?.apiBaseUrl || "https://api.cline.bot").replace(/\/$/, "");
  return base === "https://api.cline.bot" ? CLINE_USAGE_LIMITS_URL : `${base}/api/v1/users/me/plan/usage-limits`;
}

function publicProfile(profile) {
  return {
    name: profile.name,
    label: profile.label,
    accountMasked: "",
    emailMasked: profile.email ? `${profile.email.slice(0, 2)}…` : "",
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    expiresAt: profile.expiresAt || "",
    available: profile.available !== false,
  };
}

function renameErrorMessage(from, to, reason) {
  if (reason === "missing-source") return `profile "${from}" not found`;
  if (reason === "invalid-target") return `profile name "${to}" is invalid`;
  if (reason === "target-exists") return `profile "${to}" already exists`;
  return `profile "${from}" was not renamed`;
}

async function readJsonSafe(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function methodNotAllowed(allowed) {
  return json({ error: "method not allowed", allowed }, { status: 405, headers: { allow: allowed.join(", ") } });
}

function json(value, init = {}) {
  return { status: init.status || 200, body: JSON.stringify(value, null, 2), headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) } };
}
