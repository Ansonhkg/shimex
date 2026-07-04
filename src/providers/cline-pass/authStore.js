import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expandHome } from "../../core/paths.js";

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function defaultClineAuthsPath(rootConfig) {
  const runtimeHome = rootConfig?.runtime?.home
    ? expandHome(rootConfig.runtime.home)
    : expandHome("~/.shimex");
  return join(runtimeHome, "cline-auths.json");
}

export function clineAuthStorePath(config, rootConfig) {
  const explicit = config?.options?.auths_path || config?.options?.authsPath;
  return explicit ? expandHome(explicit) : defaultClineAuthsPath(rootConfig);
}

export async function readClineAuths(path) {
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { profiles: {}, defaultProfile: "", path };
  }
  const profiles = {};
  for (const [name, value] of Object.entries(data?.profiles || {})) {
    const normalized = normalizeStoredProfile(name, value);
    if (normalized) profiles[normalized.name] = normalized;
  }
  const rawDefault = typeof data?.default_profile === "string" ? data.default_profile.trim() : "";
  return { profiles, defaultProfile: rawDefault && profiles[rawDefault] ? rawDefault : rawDefault, path };
}

export async function writeClineAuths(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const output = {
    version: 1,
    default_profile: payload.defaultProfile || "",
    profiles: Object.fromEntries(
      Object.values(payload.profiles || {}).map((profile) => [profile.name, serializeStoredProfile(profile)]),
    ),
  };
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return { path, written: true, profileNames: Object.keys(output.profiles) };
}

export function listClineProfileSummaries(store) {
  return Object.values(store.profiles)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((profile) => ({
      name: profile.name,
      label: profile.label || profile.name,
      accountMasked: maskAccountId(profile.accountId),
      emailMasked: maskEmail(profile.email),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      expiresAt: profile.expiresAt || "",
      expiresInSeconds: expiresInSeconds(profile.expiresAt),
      tokenExpired: isExpired(profile.expiresAt),
      available: profile.available !== false,
      note: profile.note || "",
      isDefault: profile.name === store.defaultProfile,
    }));
}

export function upsertClineProfile(store, name, payload) {
  const profileName = normalizeProfileName(name);
  if (!profileName) {
    throw new Error("Profile name must match [a-zA-Z0-9][a-zA-Z0-9._-]* and be 1-64 characters.");
  }
  const tokens = parseClineAuthPayload(payload);
  if (!tokens.accessToken) {
    throw new Error("Cline auth payload is missing an access token.");
  }
  const now = new Date().toISOString();
  const existing = store.profiles[profileName];
  const profile = {
    name: profileName,
    label: payload.label || existing?.label || profileName,
    accountId: tokens.accountId || existing?.accountId || "",
    email: tokens.email || existing?.email || "",
    accessToken: stripWorkosPrefix(tokens.accessToken),
    refreshToken: tokens.refreshToken || existing?.refreshToken || "",
    expiresAt: tokens.expiresAt || existing?.expiresAt || "",
    tokenType: tokens.tokenType || existing?.tokenType || "Bearer",
    provider: tokens.provider || existing?.provider || "cline",
    available: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    note: payload.note || existing?.note || "",
  };
  const profiles = { ...store.profiles, [profileName]: profile };
  const defaultProfile = store.defaultProfile || profileName;
  return { profiles, defaultProfile, profile };
}

export function removeClineProfile(store, name) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !store.profiles[profileName]) return { profiles: store.profiles, defaultProfile: store.defaultProfile, removed: null };
  const { [profileName]: _removed, ...rest } = store.profiles;
  const defaultProfile = store.defaultProfile === profileName ? Object.keys(rest)[0] || "" : store.defaultProfile;
  return { profiles: rest, defaultProfile, removed: profileName };
}

export function renameClineProfile(store, fromName, toName) {
  const fromProfileName = normalizeProfileName(fromName);
  const toProfileName = normalizeProfileName(toName);
  if (!fromProfileName || !store.profiles[fromProfileName]) return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "missing-source" };
  if (!toProfileName) return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "invalid-target" };
  if (fromProfileName === toProfileName) return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "unchanged" };
  if (store.profiles[toProfileName]) return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "target-exists" };
  const now = new Date().toISOString();
  const { [fromProfileName]: source, ...rest } = store.profiles;
  const profile = {
    ...source,
    name: toProfileName,
    label: source.label === fromProfileName ? toProfileName : source.label || toProfileName,
    updatedAt: now,
  };
  return {
    profiles: { ...rest, [toProfileName]: profile },
    defaultProfile: store.defaultProfile === fromProfileName ? toProfileName : store.defaultProfile,
    profile,
    renamed: true,
    from: fromProfileName,
    to: toProfileName,
  };
}

export function setDefaultClineProfile(store, name) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !store.profiles[profileName]) return { ...store, changed: false };
  return { ...store, defaultProfile: profileName, changed: store.defaultProfile !== profileName };
}

export function resolveClineProfileForSlug(store, slug) {
  const names = Object.keys(store.profiles).sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const name of names) {
    if (slug === name || slug.startsWith(`${name}-`)) {
      const profile = store.profiles[name];
      return { profile, modelSlugPart: slug === name ? "" : slug.slice(`${name}-`.length) };
    }
  }
  if (store.defaultProfile && store.profiles[store.defaultProfile]) {
    return { profile: store.profiles[store.defaultProfile], modelSlugPart: slug };
  }
  return null;
}

export function maskAccountId(accountId) {
  if (!accountId) return "";
  if (accountId.length <= 6) return "*".repeat(accountId.length);
  return `${accountId.slice(0, 3)}…${accountId.slice(-3)}`;
}

export function stripWorkosPrefix(token) {
  return String(token || "").toLowerCase().startsWith("workos:") ? String(token).slice("workos:".length) : String(token || "");
}

export function withWorkosPrefix(token) {
  const value = String(token || "").trim();
  return value.toLowerCase().startsWith("workos:") ? value : `workos:${value}`;
}

function normalizeStoredProfile(name, value) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !value || typeof value !== "object") return null;
  const accessToken = firstString(value.access_token, value.accessToken, value.access);
  if (!accessToken) return null;
  return {
    name: profileName,
    label: firstString(value.label) || profileName,
    accountId: firstString(value.account_id, value.accountId),
    email: firstString(value.email),
    accessToken: stripWorkosPrefix(accessToken),
    refreshToken: firstString(value.refresh_token, value.refreshToken, value.refresh),
    expiresAt: normalizeExpiresAt(value.expires_at || value.expiresAt || value.expires),
    tokenType: firstString(value.token_type, value.tokenType) || "Bearer",
    provider: firstString(value.provider) || "cline",
    available: value.available !== false,
    createdAt: firstString(value.created_at, value.createdAt) || new Date().toISOString(),
    updatedAt: firstString(value.updated_at, value.updatedAt),
    note: firstString(value.note),
  };
}

function serializeStoredProfile(profile) {
  return {
    label: profile.label || profile.name,
    account_id: profile.accountId || "",
    email: profile.email || "",
    access_token: stripWorkosPrefix(profile.accessToken),
    refresh_token: profile.refreshToken || "",
    expires_at: profile.expiresAt || "",
    token_type: profile.tokenType || "Bearer",
    provider: profile.provider || "cline",
    available: profile.available !== false,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
    note: profile.note || "",
  };
}

function parseClineAuthPayload(payload) {
  if (typeof payload === "string") return parseClineAuthPayload(JSON.parse(payload));
  if (!payload || typeof payload !== "object") throw new Error("Cline auth payload must be a JSON object.");
  const auth = payload.providers?.cline?.settings?.auth || payload.auth || payload.credentials || payload.data || payload;
  const userInfo = auth.userInfo || auth.metadata?.userInfo || payload.userInfo || {};
  const accessToken = firstString(auth.access_token, auth.accessToken, auth.access, auth.idToken, payload.accessToken);
  return {
    accessToken,
    refreshToken: firstString(auth.refresh_token, auth.refreshToken, auth.refresh, payload.refreshToken),
    expiresAt: normalizeExpiresAt(auth.expires_at || auth.expiresAt || auth.expires || payload.expiresAt),
    accountId: firstString(auth.account_id, auth.accountId, userInfo.clineUserId, userInfo.id),
    email: firstString(auth.email, userInfo.email),
    tokenType: firstString(auth.token_type, auth.tokenType, auth.metadata?.tokenType) || "Bearer",
    provider: firstString(auth.provider, auth.metadata?.provider, payload.provider) || "cline",
  };
}

function normalizeProfileName(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  return PROFILE_NAME_PATTERN.test(trimmed) ? trimmed : "";
}

function firstString(...values) {
  for (const value of values) if (typeof value === "string" && value) return value;
  return "";
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

function expiresInSeconds(expiresAt) {
  const time = Date.parse(expiresAt || "");
  if (!Number.isFinite(time)) return null;
  return Math.floor((time - Date.now()) / 1000);
}

function isExpired(expiresAt) {
  const seconds = expiresInSeconds(expiresAt);
  return seconds == null ? false : seconds <= 0;
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}…@${domain}`;
}
