import { copyFile, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProjectEnv } from "./env.js";
import { projectRoot } from "./paths.js";
import { parseSimpleYaml } from "./simpleYaml.js";
import { normalizeConfig } from "./config.js";

export function shimexConfigPath(options = {}) {
  return options.path || join(projectRoot(), "shimex.yml");
}

export async function readShimexConfigFile(options = {}) {
  const path = shimexConfigPath(options);
  const text = await readFile(path, "utf8");
  const info = await stat(path);
  return {
    path,
    text,
    bytes: Buffer.byteLength(text, "utf8"),
    mtimeMs: info.mtimeMs,
    mtime: info.mtime.toISOString(),
  };
}

export async function validateShimexConfigText(text, options = {}) {
  const rawText = String(text ?? "");
  if (!rawText.trim()) {
    throw new Error("shimex.yml cannot be empty.");
  }
  if (rawText.includes("\0")) {
    throw new Error("shimex.yml contains invalid null bytes.");
  }
  await loadProjectEnv();
  let parsed;
  try {
    parsed = parseSimpleYaml(rawText);
  } catch (error) {
    throw new Error(`Invalid YAML: ${String(error?.message || error)}`);
  }
  let config;
  try {
    config = normalizeConfig(parsed);
  } catch (error) {
    throw new Error(`Invalid config: ${String(error?.message || error)}`);
  }
  return {
    path: shimexConfigPath(options),
    parsed,
    config,
    providerCount: Array.isArray(config.providers) ? config.providers.length : 0,
    enabledProviders: (config.providers || []).filter((provider) => provider.enabled !== false).length,
  };
}

export async function writeShimexConfigFile(text, options = {}) {
  const path = shimexConfigPath(options);
  const validation = await validateShimexConfigText(text, options);
  const nextText = String(text);
  const body = nextText.endsWith("\n") ? nextText : `${nextText}\n`;
  const backupPath = options.backup === false ? "" : `${path}.bak`;
  if (backupPath) {
    await copyFile(path, backupPath).catch(() => null);
  }
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, body, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryPath, path);
  const info = await stat(path);
  return {
    ok: true,
    path,
    backupPath: backupPath || null,
    bytes: Buffer.byteLength(body, "utf8"),
    mtimeMs: info.mtimeMs,
    mtime: info.mtime.toISOString(),
    providerCount: validation.providerCount,
    enabledProviders: validation.enabledProviders,
    requiresRestart: true,
  };
}

export function listShimexProviderSections(text) {
  const parsed = parseSimpleYaml(String(text ?? ""));
  if (!Array.isArray(parsed.providers)) return [];
  return parsed.providers
    .filter((provider) => provider && typeof provider === "object" && !Array.isArray(provider) && provider.id)
    .map((provider) => structuredClone(provider));
}

export function replaceShimexProviderSection(text, providerId, provider) {
  const id = String(providerId || "").trim();
  if (!id) throw new Error("Provider id is required.");
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    throw new Error("Provider configuration must be an object.");
  }
  if (String(provider.id || "").trim() !== id) {
    throw new Error("Provider id cannot be changed from this form.");
  }

  const source = String(text ?? "");
  const parsed = parseSimpleYaml(source);
  const currentProviders = Array.isArray(parsed.providers) ? parsed.providers : [];
  if (!currentProviders.some((item) => String(item?.id || "") === id)) {
    throw new Error(`Provider not found in shimex.yml: ${id}`);
  }

  const lines = source.split(/\r?\n/);
  const providersLine = lines.findIndex((line) => /^providers:\s*(?:#.*)?$/.test(line));
  if (providersLine < 0) throw new Error("shimex.yml does not contain a providers list.");

  const firstItem = findProviderItem(lines, providersLine + 1);
  if (!firstItem) throw new Error("shimex.yml does not contain a provider entry.");
  const start = findProviderById(lines, providersLine + 1, firstItem.indent, id);
  if (start < 0) throw new Error(`Provider block not found in shimex.yml: ${id}`);
  const end = findNextProviderOrTopLevel(lines, start + 1, firstItem.indent);
  const replacement = stringifyProvider(provider, firstItem.indent);
  lines.splice(start, end - start, ...replacement);
  return lines.join("\n");
}

function findProviderItem(lines, from) {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !/^\s/.test(line) && !/^\s*(?:#.*)?$/.test(line)) return null;
    const match = line.match(/^(\s*)-\s+id:\s*(.*?)\s*(?:#.*)?$/);
    if (match) return { index, indent: match[1].length };
  }
  return null;
}

function findProviderById(lines, from, indent, id) {
  const item = new RegExp(`^\\s{${indent}}-\\s+id:\\s*(.*?)\\s*(?:#.*)?$`);
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !/^\s/.test(line) && !/^\s*(?:#.*)?$/.test(line)) break;
    const match = line.match(item);
    if (match && unquoteYamlScalar(match[1]) === id) return index;
  }
  return -1;
}

function findNextProviderOrTopLevel(lines, from, indent) {
  const item = new RegExp(`^\\s{${indent}}-\\s+id:`);
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index];
    if (item.test(line) || (line && !/^\s/.test(line) && !/^\s*(?:#.*)?$/.test(line))) {
      return index;
    }
  }
  return lines.length;
}

function unquoteYamlScalar(value) {
  return String(value || "").trim().replace(/^(?:"|')|(?:"|')$/g, "");
}

function stringifyProvider(provider, indent) {
  const prefix = " ".repeat(indent);
  const nested = " ".repeat(indent + 2);
  const lines = [`${prefix}- id: ${stringifyYamlScalar(provider.id)}`];
  for (const [key, value] of Object.entries(provider)) {
    if (key === "id" || value === undefined) continue;
    stringifyYamlEntry(lines, key, value, nested);
  }
  return lines;
}

function stringifyYamlEntry(lines, key, value, indent) {
  if (isYamlScalar(value) || isScalarArray(value)) {
    lines.push(`${indent}${key}: ${stringifyYamlValue(value)}`);
    return;
  }
  lines.push(`${indent}${key}:`);
  if (Array.isArray(value)) {
    for (const item of value) stringifyYamlListItem(lines, item, `${indent}  `);
    return;
  }
  for (const [childKey, childValue] of Object.entries(value || {})) {
    stringifyYamlEntry(lines, childKey, childValue, `${indent}  `);
  }
}

function stringifyYamlListItem(lines, value, indent) {
  if (isYamlScalar(value) || isScalarArray(value)) {
    lines.push(`${indent}- ${stringifyYamlValue(value)}`);
    return;
  }
  const entries = Object.entries(value || {}).filter(([, childValue]) => childValue !== undefined);
  if (!entries.length) {
    lines.push(`${indent}- {}`);
    return;
  }
  const [firstKey, firstValue] = entries[0];
  if (isYamlScalar(firstValue) || isScalarArray(firstValue)) {
    lines.push(`${indent}- ${firstKey}: ${stringifyYamlValue(firstValue)}`);
  } else {
    lines.push(`${indent}- ${firstKey}:`);
    if (Array.isArray(firstValue)) {
      for (const item of firstValue) stringifyYamlListItem(lines, item, `${indent}    `);
    } else {
      for (const [key, item] of Object.entries(firstValue || {})) stringifyYamlEntry(lines, key, item, `${indent}    `);
    }
  }
  for (const [key, item] of entries.slice(1)) stringifyYamlEntry(lines, key, item, `${indent}  `);
}

function isYamlScalar(value) {
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isScalarArray(value) {
  return Array.isArray(value) && value.every(isYamlScalar);
}

function stringifyYamlValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stringifyYamlScalar(item)).join(", ")}]`;
  return stringifyYamlScalar(value);
}

function stringifyYamlScalar(value) {
  if (value == null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (!text || /[\n#\[\]{},]/.test(text) || /^(?:true|false|null|-?\d+(?:\.\d+)?)$/i.test(text) || /^\s|\s$/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}
