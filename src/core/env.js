import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "./paths.js";

export async function loadProjectEnv(path = join(projectRoot(), ".env")) {
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

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
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
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
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
