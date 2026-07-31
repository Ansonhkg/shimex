import { copyFile, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "./paths.js";

export function projectEnvPath(options = {}) {
  return options.path || join(projectRoot(), ".env");
}

export async function loadProjectEnv(path = projectEnvPath()) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { loaded: false, path };
  }
  const loaded = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry || process.env[entry.key] !== undefined) {
      continue;
    }
    process.env[entry.key] = entry.value;
    loaded.push(entry.key);
  }
  return { loaded: true, path, keys: loaded };
}

export async function readProjectEnvFile(options = {}) {
  const path = projectEnvPath(options);
  try {
    const text = await readFile(path, "utf8");
    const info = await stat(path);
    return {
      path,
      text,
      exists: true,
      bytes: Buffer.byteLength(text, "utf8"),
      mtimeMs: info.mtimeMs,
      mtime: info.mtime.toISOString(),
      keys: listEnvKeys(text),
    };
  } catch {
    return {
      path,
      text: "",
      exists: false,
      bytes: 0,
      mtimeMs: null,
      mtime: "",
      keys: [],
    };
  }
}

export function validateProjectEnvText(text) {
  const rawText = String(text ?? "");
  if (rawText.includes("\0")) {
    throw new Error(".env contains invalid null bytes.");
  }
  const keys = [];
  const seen = new Set();
  const lines = rawText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const entry = parseEnvLine(line);
    if (!entry) {
      throw new Error(`Invalid .env line ${index + 1}: ${trimmed.slice(0, 80)}`);
    }
    if (seen.has(entry.key)) {
      throw new Error(`Duplicate env key on line ${index + 1}: ${entry.key}`);
    }
    seen.add(entry.key);
    keys.push(entry.key);
  }
  return {
    ok: true,
    keys,
    keyCount: keys.length,
  };
}

export async function writeProjectEnvFile(text, options = {}) {
  const path = projectEnvPath(options);
  const validation = validateProjectEnvText(text);
  const nextText = String(text);
  const body = nextText.endsWith("\n") ? nextText : `${nextText}\n`;
  const backupPath = options.backup === false ? "" : `${path}.bak`;
  if (backupPath) {
    await copyFile(path, backupPath).catch(() => null);
  }
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, body, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  const info = await stat(path);
  return {
    ok: true,
    path,
    backupPath: backupPath || null,
    bytes: Buffer.byteLength(body, "utf8"),
    mtimeMs: info.mtimeMs,
    mtime: info.mtime.toISOString(),
    keys: validation.keys,
    keyCount: validation.keyCount,
    requiresRestart: true,
  };
}

export function listEnvKeys(text) {
  const keys = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry) keys.push(entry.key);
  }
  return keys;
}

export function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const separator = normalized.indexOf("=");
  if (separator <= 0) {
    return null;
  }
  const key = normalized.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  return { key, value: parseEnvValue(normalized.slice(separator + 1).trim()) };
}

function parseEnvValue(value) {
  if (!value) {
    return "";
  }
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote) && value.length >= 2) {
    const inner = value.slice(1, -1);
    return quote === "\"" ? unescapeDoubleQuoted(inner) : inner;
  }
  return stripInlineComment(value).trim();
}

function unescapeDoubleQuoted(value) {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll("\\\"", "\"")
    .replaceAll("\\\\", "\\");
}

function stripInlineComment(value) {
  const index = value.search(/\s#/);
  return index >= 0 ? value.slice(0, index) : value;
}
