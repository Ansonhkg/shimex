import { discoverModels } from "../../core/modelDiscovery.js";
import { hasImageInput, jsonResult } from "../routes.js";

export async function resolveAutoRouterCandidate(config, route, body) {
  const models = await discoverModels(config);
  const modelBySlug = new Map(models.map((model) => [model.slug, model]));
  const needsImage = hasImageInput(body);
  const configured = Array.isArray(route.providerConfig.options.candidates)
    ? route.providerConfig.options.candidates
    : [];
  const candidates = configured
    .map((candidate, index) => ({
      slug: String(candidate.slug || candidate.id || "").trim(),
      cost: finiteCost(candidate.cost, index + 1),
      index,
    }))
    .filter((candidate) => candidate.slug && candidate.slug !== route.model.slug)
    .map((candidate) => ({ ...candidate, model: modelBySlug.get(candidate.slug) }))
    .filter((candidate) => candidate.model)
    .filter((candidate) => !needsImage || candidate.model.inputModalities.includes("image"))
    .sort((left, right) => left.cost - right.cost || left.index - right.index);
  const preferredDefault = route.providerConfig.options.default;
  if (preferredDefault) {
    const defaultCandidate = candidates.find((candidate) => candidate.slug === preferredDefault);
    if (defaultCandidate) {
      return defaultCandidate.slug;
    }
  }
  return candidates[0]?.slug || "";
}

function finiteCost(value, fallback) {
  const cost = Number(value ?? fallback);
  return Number.isFinite(cost) ? cost : fallback;
}

export function autoRouterNoCandidateResult(route) {
  return jsonResult({
    error: {
      message: `${route.model.slug} has no available Auto Router candidates for this request.`,
      type: "shimex_auto_router_no_candidate",
    },
  }, 400);
}
