import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function providerModelCachePath(rootConfig, providerConfig) {
  const endpointHash = createHash("sha1").update(providerConfig.endpoint || providerConfig.id).digest("hex").slice(0, 10);
  return join(rootConfig.runtime.home, "provider-models", `${providerConfig.id}-${endpointHash}.json`);
}

export async function readProviderModelCache(rootConfig, providerConfig) {
  try {
    const payload = JSON.parse(await readFile(providerModelCachePath(rootConfig, providerConfig), "utf8"));
    return Array.isArray(payload.models) ? payload.models : [];
  } catch {
    return [];
  }
}

export async function writeProviderModelCache(rootConfig, providerConfig, models) {
  const path = providerModelCachePath(rootConfig, providerConfig);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ refreshedAt: new Date().toISOString(), models }, null, 2)}\n`);
  return path;
}

export function shouldRefreshModels(providerConfig) {
  const models = providerConfig.options?.models;
  if (models && typeof models === "object" && !Array.isArray(models)) {
    return models.refresh === "on_start" || models.refresh === true;
  }
  return providerConfig.options?.models_refresh === "on_start" || providerConfig.options?.modelsRefresh === "on_start";
}

