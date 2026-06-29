export function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

export function normalizeModel(providerId, raw, index = 0, providerDisplayName = providerId) {
  const upstreamModel = raw.upstreamModel || raw.upstream_model || raw.model || raw.id || raw.slug;
  const displayName = raw.displayName || raw.display_name || raw.name || upstreamModel;
  const slug = raw.slug || slugify(`${providerId}-${upstreamModel}`);
  const inputModalities = normalizeModalities(raw.inputModalities || raw.input_modalities || raw.modalities);
  return {
    slug,
    providerId,
    providerDisplayName,
    upstreamModel,
    displayName,
    contextWindow: Number(raw.contextWindow || raw.context_window || raw.context || 128000),
    maxOutputTokens: raw.maxOutputTokens || raw.max_output_tokens || null,
    inputModalities,
    reasoningLevel: raw.reasoningLevel || raw.reasoning_level || "medium",
    priority: raw.priority || Math.max(1, 1000 - index),
    raw,
  };
}

export function normalizeModalities(value) {
  if (!value) {
    return ["text"];
  }
  const modalities = Array.isArray(value) ? value : [value];
  const normalized = modalities.map((item) => String(item).trim()).filter(Boolean);
  return normalized.length ? normalized : ["text"];
}
