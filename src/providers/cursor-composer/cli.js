import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { expandHome } from "../../core/paths.js";

const execFileAsync = promisify(execFile);
// Cursor's current CLI uses `agent` as its primary command but still installs
// `cursor-agent` as a compatibility alias. Discover the namespaced alias so a
// different tool's generic `agent` binary cannot be selected accidentally.
// Remove this alias path when Cursor stops shipping it and Shimex has a
// replacement that preserves the same collision protection.
const DEFAULT_CURSOR_AGENT_BIN = "cursor-agent";
const STATUS_CACHE_TTL_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;
const MODEL_LIST_TIMEOUT_MS = 10_000;
const statusCache = new Map();

export async function resolveCursorAgentBin(providerConfig = {}) {
  const explicit = configuredCursorAgentBin(providerConfig);
  if (explicit) {
    return expandHome(explicit);
  }

  const candidates = await cursorAgentCandidates();
  return candidates[0] || DEFAULT_CURSOR_AGENT_BIN;
}

export async function checkCursorAgentAuth(providerConfig = {}) {
  if (providerConfig.options?.show_without_auth === true) {
    return { authenticated: true, bypassed: true, agentBin: "" };
  }

  const agentBin = await resolveCursorAgentBin(providerConfig);
  const cacheKey = `${agentBin}|${Boolean(process.env.CURSOR_API_KEY)}`;
  const cached = statusCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await probeCursorAgentAuth(agentBin, providerConfig);
  statusCache.set(cacheKey, { value, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
  return value;
}

export function clearCursorAgentAuthCache() {
  statusCache.clear();
}

export async function listCursorAgentModels(providerConfig = {}) {
  const agentBin = await resolveCursorAgentBin(providerConfig);
  const result = await execFileAsync(agentBin, ["models"], {
    cwd: cursorWorkspace(providerConfig),
    env: cursorAgentEnv(),
    timeout: MODEL_LIST_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    agentBin,
    models: parseCursorAgentModels(result.stdout || ""),
  };
}

export function cursorAgentEnv() {
  const env = { ...process.env };
  if (process.env.CURSOR_AGENT_BIN) {
    const parent = process.env.CURSOR_AGENT_BIN.split("/").slice(0, -1).join("/");
    if (parent) {
      env.PATH = `${parent}:${env.PATH || ""}`;
    }
  }
  return env;
}

export function cursorWorkspace(providerConfig = {}) {
  return expandHome(
    process.env.SHIMEX_CURSOR_WORKSPACE
      || providerConfig.options?.workspace
      || process.cwd(),
  );
}

async function probeCursorAgentAuth(agentBin, providerConfig) {
  try {
    const result = await execFileAsync(agentBin, ["status"], {
      cwd: cursorWorkspace(providerConfig),
      env: cursorAgentEnv(),
      timeout: STATUS_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });
    if (looksUnauthenticated(`${result.stdout || ""}\n${result.stderr || ""}`)) {
      return { authenticated: false, agentBin, reason: "not-authenticated" };
    }
    return { authenticated: true, agentBin };
  } catch (error) {
    return {
      authenticated: false,
      agentBin,
      reason: classifyProbeFailure(error),
    };
  }
}

export function parseCursorAgentModels(output) {
  const models = [];
  const seen = new Set();
  for (const rawLine of String(output || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "Available models" || line.startsWith("Tip:")) {
      continue;
    }
    const match = line.match(/^([^\s]+)\s+-\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const id = match[1].trim();
    const displayName = match[2].trim();
    if (!id || !displayName || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({ id, displayName });
  }
  return models;
}

function looksUnauthenticated(output) {
  const normalized = String(output || "").toLowerCase();
  return [
    "not logged in",
    "not authenticated",
    "authentication required",
    "please log in",
    "run agent login",
    "run cursor-agent login",
  ].some((marker) => normalized.includes(marker));
}

function classifyProbeFailure(error) {
  if (error?.code === "ENOENT") {
    return "not-installed";
  }
  if (error?.code === "ETIMEDOUT") {
    return "status-timeout";
  }
  return "not-authenticated";
}

function configuredCursorAgentBin(providerConfig) {
  return providerConfig.options?.cursor_agent_bin
    || providerConfig.options?.cursorAgentBin
    || providerConfig.options?.agent_path
    || providerConfig.options?.agentPath
    || process.env.CURSOR_AGENT_BIN
    || "";
}

async function cursorAgentCandidates() {
  const home = homedir();
  const candidates = [
    ...pathCandidates("cursor-agent"),
    join(home, ".local", "bin", "cursor-agent"),
    join(home, ".cursor", "bin", "cursor-agent"),
    ...(await installedVersionCandidates(home)),
  ];
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || !(await isExecutable(candidate))) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}

function pathCandidates(name) {
  return String(process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => join(entry, name));
}

async function installedVersionCandidates(home) {
  const root = join(home, ".local", "share", "cursor-agent", "versions");
  let versions;
  try {
    versions = await readdir(root);
  } catch {
    return [];
  }
  return versions
    .sort()
    .reverse()
    .map((version) => join(root, version, "cursor-agent"));
}

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
