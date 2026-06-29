import { normalizeModel } from "./model.js";
import { getProviderManifest } from "../providers/index.js";

export async function discoverModels(config) {
  const models = [];
  for (const providerConfig of config.providers) {
    if (!providerConfig.enabled) {
      continue;
    }
    const provider = getProviderManifest(providerConfig.id);
    if (!provider) {
      continue;
    }
    const discovered = provider.discoverModels
      ? await provider.discoverModels(providerConfig, config)
      : providerConfig.models;
    discovered.forEach((model, index) => {
      models.push(normalizeModel(provider.id, model, models.length + index));
    });
  }
  return dedupeSlugs(models);
}

export async function refreshProviderModelCaches(config) {
  const results = [];
  for (const providerConfig of config.providers) {
    if (!providerConfig.enabled) {
      continue;
    }
    const provider = getProviderManifest(providerConfig.id);
    if (!provider?.refreshModels) {
      continue;
    }
    results.push(await provider.refreshModels(providerConfig, config));
  }
  return results;
}

function dedupeSlugs(models) {
  const seen = new Map();
  return models.map((model) => {
    const count = seen.get(model.slug) || 0;
    seen.set(model.slug, count + 1);
    if (count === 0) {
      return model;
    }
    return { ...model, slug: `${model.slug}-${count + 1}` };
  });
}
