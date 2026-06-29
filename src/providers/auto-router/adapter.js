import { discoverModels } from "../../core/modelDiscovery.js";
import { hasImageInput, jsonResult } from "../routes.js";

const decisionCache = new Map();

export async function resolveAutoRouterCandidate(config, route, body, options = {}) {
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
      card: String(candidate.card || "").trim(),
      index,
    }))
    .filter((candidate) => candidate.slug && candidate.slug !== route.model.slug)
    .map((candidate) => ({ ...candidate, model: modelBySlug.get(candidate.slug) }))
    .filter((candidate) => candidate.model)
    .filter((candidate) => !needsImage || candidate.model.inputModalities.includes("image"))
    .sort((left, right) => left.cost - right.cost || left.index - right.index);
  if (!candidates.length) {
    return "";
  }
  const classified = await classifiedCandidate(route, body, candidates, options);
  if (classified) {
    return classified;
  }
  const preferredDefault = route.providerConfig.options.default;
  if (preferredDefault) {
    const defaultCandidate = candidates.find((candidate) => candidate.slug === preferredDefault);
    if (defaultCandidate) {
      return defaultCandidate.slug;
    }
  }
  return candidates[0].slug;
}

function finiteCost(value, fallback) {
  const cost = Number(value ?? fallback);
  return Number.isFinite(cost) ? cost : fallback;
}

async function classifiedCandidate(route, body, candidates, options) {
  if (!options.classify || !route.providerConfig.options.classifier) {
    return "";
  }
  const task = latestTaskText(body);
  const cacheKey = route.providerConfig.options.cache === false ? "" : `${route.model.slug}:${task}`;
  if (cacheKey && decisionCache.has(cacheKey)) {
    return decisionCache.get(cacheKey);
  }
  let raw;
  try {
    raw = await options.classify(classifierPrompt(route, body, candidates));
  } catch {
    return "";
  }
  const scores = parseScores(raw);
  if (!scores.size) {
    return "";
  }
  const threshold = Number(route.providerConfig.options.threshold ?? 0.7);
  const viable = candidates
    .map((candidate) => ({ ...candidate, score: scores.get(candidate.slug) ?? 0 }))
    .filter((candidate) => candidate.score >= threshold)
    .sort((left, right) => left.cost - right.cost || right.score - left.score || left.index - right.index);
  const selected = viable[0]?.slug || "";
  if (selected && cacheKey) {
    decisionCache.set(cacheKey, selected);
    if (decisionCache.size > 256) {
      decisionCache.delete(decisionCache.keys().next().value);
    }
  }
  return selected;
}

function classifierPrompt(route, body, candidates) {
  const candidateLines = candidates
    .map((candidate) => {
      const card = candidate.card ? `\nCard: ${candidate.card}` : "";
      return `- ${candidate.slug} (cost ${candidate.cost}, modalities ${candidate.model.inputModalities.join(",")})${card}`;
    })
    .join("\n");
  return [
    "Score each candidate model from 0.0 to 1.0 for how likely it is to complete the task correctly.",
    "Return only a JSON object mapping candidate slug to score. Do not include prose.",
    "",
    `Router: ${route.model.slug}`,
    "Candidates:",
    candidateLines,
    "",
    "Task:",
    latestTaskText(body),
  ].join("\n");
}

function parseScores(text) {
  const scores = new Map();
  const parsed = parseJsonish(text);
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const slug = String(item?.slug || item?.model || "").trim();
      const score = Number(item?.score);
      if (slug && Number.isFinite(score)) {
        scores.set(slug, score);
      }
    }
    return scores;
  }
  if (parsed && typeof parsed === "object") {
    for (const [slug, score] of Object.entries(parsed)) {
      const value = Number(score);
      if (Number.isFinite(value)) {
        scores.set(slug, value);
      }
    }
  }
  return scores;
}

function parseJsonish(text) {
  const value = String(text || "").trim();
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function latestTaskText(body) {
  if (typeof body.input === "string") {
    return body.input.trim();
  }
  if (Array.isArray(body.input)) {
    for (const item of [...body.input].reverse()) {
      const text = itemText(item);
      if (text) {
        return text;
      }
    }
  }
  if (Array.isArray(body.messages)) {
    for (const message of [...body.messages].reverse()) {
      if (message?.role === "user") {
        const text = itemText(message.content);
        if (text) {
          return text;
        }
      }
    }
  }
  return "";
}

function itemText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(itemText).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    return itemText(value.content || value.text || value.output || "");
  }
  return "";
}

export function autoRouterNoCandidateResult(route) {
  return jsonResult({
    error: {
      message: `${route.model.slug} has no available Auto Router candidates for this request.`,
      type: "shimex_auto_router_no_candidate",
    },
  }, 400);
}
