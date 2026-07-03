import { discoverModels } from "../core/modelDiscovery.js";
import { getProviderManifest } from "./index.js";

export async function resolveModelRoute(config, requestedModel) {
  const model = (await discoverModels(config)).find((candidate) => candidate.slug === requestedModel);
  if (!model) {
    return null;
  }
  const providerConfig = config.providers.find((provider) => provider.enabled && provider.id === model.providerId);
  const provider = getProviderManifest(model.providerId);
  if (!providerConfig || !provider) {
    return null;
  }
  return { model, provider, providerConfig, rootConfig: config };
}

export function validateModelInput(route, body) {
  if (hasImageInput(body) && !route.model.inputModalities.includes("image")) {
    return jsonResult({
      error: {
        message: `${route.model.slug} does not support image input.`,
        type: "shimex_unsupported_modality",
      },
    }, 400);
  }
  return null;
}

export function hasImageInput(value) {
  if (Array.isArray(value)) {
    return value.some(hasImageInput);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (["input_image", "image_url"].includes(value.type)) {
    return true;
  }
  if (value.image_url || value.image_base64) {
    return true;
  }
  return hasImageInput(value.input) || hasImageInput(value.messages) || hasImageInput(value.content) || hasImageInput(value.output);
}

export function jsonResult(body, status = 200, headers = {}) {
  return {
    status,
    body: JSON.stringify(body, null, 2),
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  };
}

export function streamResult(stream) {
  return {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
    stream,
  };
}

