import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expandHome } from "../../core/paths.js";

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function defaultCodexAuthsPath(rootConfig) {
  const runtimeHome = rootConfig?.runtime?.home
    ? expandHome(rootConfig.runtime.home)
    : expandHome("~/.shimex");
  return join(runtimeHome, "codex-auths.json");
}

export function authStorePath(config, rootConfig) {
  const explicit = config?.options?.auths_path || config?.options?.authsPath;
  if (explicit) {
    return expandHome(explicit);
  }
  return defaultCodexAuthsPath(rootConfig);
}

export async function readCodexAuths(path) {
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { profiles: {}, defaultProfile: "", path };
  }
  const profiles = {};
  for (const [name, value] of Object.entries(data?.profiles || {})) {
    const normalized = normalizeStoredProfile(name, value);
    if (normalized) {
      profiles[normalized.name] = normalized;
    }
  }
  const _rawDefault = typeof data?.default_profile === "string" ? data.default_profile : "";
  const defaultProfile = _rawDefault.trim() ? _rawDefault.trim() : "";
  return { profiles, defaultProfile, path };
}

export async function writeCodexAuths(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const output = {
    version: 1,
    default_profile: payload.defaultProfile || "",
    profiles: Object.fromEntries(
      Object.values(payload.profiles || {}).map((profile) => [profile.name, serializeStoredProfile(profile)]),
    ),
  };
  const text = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(path, text, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return { path, written: true, profileNames: Object.keys(output.profiles) };
}

export function listProfileSummaries(store) {
  return Object.values(store.profiles)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((profile) => ({
      name: profile.name,
      label: profile.label || profile.name,
      accountMasked: maskAccountId(profile.accountId),
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

export function upsertProfile(store, name, payload) {
  const profileName = normalizeProfileName(name);
  if (!profileName) {
    throw new Error("Profile name must match [a-zA-Z0-9][a-zA-Z0-9._-]* and be 1-64 characters.");
  }
  const tokens = parseAuthFilePayload(payload);
  if (!tokens.accessToken) {
    throw new Error("Codex auth payload is missing tokens.access_token.");
  }
  const now = new Date().toISOString();
  const existing = store.profiles[profileName];
  const profile = {
    name: profileName,
    label: payload.label || existing?.label || profileName,
    accountId: tokens.accountId || existing?.accountId || "",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || existing?.refreshToken || "",
    idToken: tokens.idToken || existing?.idToken || "",
    expiresAt: tokens.expiresAt || existing?.expiresAt || "",
    tokenType: tokens.tokenType || existing?.tokenType || "Bearer",
    scope: tokens.scope || existing?.scope || "",
    available: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    note: payload.note || existing?.note || "",
  };
  const profiles = { ...store.profiles, [profileName]: profile };
  const defaultProfile = store.defaultProfile || profileName;
  return { profiles, defaultProfile, profile };
}

export function removeProfile(store, name) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !store.profiles[profileName]) {
    return { profiles: store.profiles, defaultProfile: store.defaultProfile, removed: null };
  }
  const { [profileName]: _removed, ...rest } = store.profiles;
  let defaultProfile = store.defaultProfile;
  if (defaultProfile === profileName) {
    defaultProfile = Object.keys(rest)[0] || "";
  }
  return { profiles: rest, defaultProfile, removed: profileName };
}

export function renameProfile(store, fromName, toName) {
  const fromProfileName = normalizeProfileName(fromName);
  const toProfileName = normalizeProfileName(toName);
  if (!fromProfileName || !store.profiles[fromProfileName]) {
    return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "missing-source" };
  }
  if (!toProfileName) {
    return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "invalid-target" };
  }
  if (fromProfileName === toProfileName) {
    return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "unchanged" };
  }
  if (store.profiles[toProfileName]) {
    return { profiles: store.profiles, defaultProfile: store.defaultProfile, renamed: false, reason: "target-exists" };
  }
  const now = new Date().toISOString();
  const { [fromProfileName]: source, ...rest } = store.profiles;
  const renamedProfile = {
    ...source,
    name: toProfileName,
    label: source.label === fromProfileName ? toProfileName : source.label || toProfileName,
    updatedAt: now,
  };
  const profiles = { ...rest, [toProfileName]: renamedProfile };
  const defaultProfile = store.defaultProfile === fromProfileName ? toProfileName : store.defaultProfile;
  return { profiles, defaultProfile, profile: renamedProfile, renamed: true, from: fromProfileName, to: toProfileName };
}

export function setDefaultProfile(store, name) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !store.profiles[profileName]) {
    return { ...store, defaultProfile: store.defaultProfile, changed: false };
  }
  return { ...store, defaultProfile: profileName, changed: store.defaultProfile !== profileName };
}

export function getProfile(store, name) {
  const profileName = normalizeProfileName(name);
  return profileName && store.profiles[profileName] ? store.profiles[profileName] : null;
}

export function resolveProfileForSlug(store, slug) {
  const names = Object.keys(store.profiles).sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const name of names) {
    if (slug === name || slug.startsWith(`${name}-`)) {
      const profile = store.profiles[name];
      if (profile) {
        const modelPart = slug === name ? "" : slug.slice(`${name}-`.length);
        return { profile, modelSlugPart: modelPart };
      }
    }
  }
  if (store.defaultProfile && store.profiles[store.defaultProfile]) {
    return { profile: store.profiles[store.defaultProfile], modelSlugPart: slug };
  }
  return null;
}

export function maskAccountId(accountId) {
  if (!accountId) {
    return "";
  }
  if (accountId.length <= 6) {
    return "*".repeat(accountId.length);
  }
  return `${accountId.slice(0, 3)}…${accountId.slice(-3)}`;
}

export function summarizeForLog(profile) {
  return `${profile.name} (account ${maskAccountId(profile.accountId)})`;
}

function normalizeProfileName(name) {
  if (typeof name !== "string") {
    return "";
  }
  const trimmed = name.trim();
  return PROFILE_NAME_PATTERN.test(trimmed) ? trimmed : "";
}

function normalizeStoredProfile(name, value) {
  const profileName = normalizeProfileName(name);
  if (!profileName || !value || typeof value !== "object") {
    return null;
  }
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  if (!accessToken) {
    return null;
  }
  return {
    name: profileName,
    label: typeof value.label === "string" ? value.label : profileName,
    accountId: typeof value.account_id === "string" ? value.account_id : "",
    accessToken,
    refreshToken: typeof value.refresh_token === "string" ? value.refresh_token : "",
    idToken: typeof value.id_token === "string" ? value.id_token : "",
    expiresAt: normalizeExpiresAt(value.expires_at || value.expires || value.expiresAt) || jwtExpiresAt(accessToken),
    tokenType: typeof value.token_type === "string" ? value.token_type : "Bearer",
    scope: typeof value.scope === "string" ? value.scope : "",
    available: value.available !== false,
    createdAt: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : "",
    note: typeof value.note === "string" ? value.note : "",
  };
}

function serializeStoredProfile(profile) {
  return {
    label: profile.label || profile.name,
    account_id: profile.accountId || "",
    access_token: profile.accessToken,
    refresh_token: profile.refreshToken || "",
    id_token: profile.idToken || "",
    expires_at: profile.expiresAt || "",
    token_type: profile.tokenType || "Bearer",
    scope: profile.scope || "",
    available: profile.available !== false,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
    note: profile.note || "",
  };
}

function parseAuthFilePayload(payload) {
  if (typeof payload === "string") {
    return parseAuthFilePayload(JSON.parse(payload));
  }
  if (Array.isArray(payload) && payload.length) {
    return parseAuthFilePayload(payload[0]);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Codex auth payload must be a JSON object.");
  }
  // pi-ai envelope: { "openai-codex": { type: "oauth", access, refresh, expires, ... } }
  const wrapped = payload["openai-codex"] && typeof payload["openai-codex"] === "object"
    ? payload["openai-codex"]
    : null;
  const tokens = wrapped
    || (payload.tokens && typeof payload.tokens === "object" ? payload.tokens : payload);
  for (const field of ["access_token", "accessToken", "access", "id_token", "api_key"]) {
    const value = tokens[field];
    if (typeof value === "string" && value) {
      const accountId = typeof tokens.account_id === "string"
        ? tokens.account_id
        : typeof tokens.accountId === "string"
          ? tokens.accountId
          : typeof payload.account_id === "string"
            ? payload.account_id
            : "";
      return {
        accessToken: value,
        accountId,
        refreshToken: firstString(tokens.refresh_token, tokens.refreshToken, tokens.refresh),
        idToken: firstString(tokens.id_token, tokens.idToken),
        expiresAt: normalizeExpiresAt(tokens.expires_at || tokens.expiresAt || tokens.expires || payload.expires_at || payload.expiresAt || payload.expires) || jwtExpiresAt(value),
        tokenType: firstString(tokens.token_type, tokens.tokenType, payload.token_type, payload.tokenType),
        scope: firstString(tokens.scope, payload.scope),
      };
    }
  }
  if (typeof payload.access_token === "string" && payload.access_token) {
    return {
      accessToken: payload.access_token,
      accountId: payload.account_id || "",
      refreshToken: firstString(payload.refresh_token, payload.refreshToken),
      idToken: firstString(payload.id_token, payload.idToken),
      expiresAt: normalizeExpiresAt(payload.expires_at || payload.expiresAt || payload.expires) || jwtExpiresAt(payload.access_token),
      tokenType: firstString(payload.token_type, payload.tokenType),
      scope: firstString(payload.scope),
    };
  }
  throw new Error("Codex auth payload is missing an access_token-shaped field.");
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
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
