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
  const webSearchToolType = normalizeWebSearchToolType(raw.webSearchToolType || raw.web_search_tool_type);
  return {
    slug,
    providerId,
    providerDisplayName,
    upstreamModel,
    displayName,
    codexDisplayName: raw.codexDisplayName || raw.codex_display_name || "",
    codexVisible: (raw.codexVisible ?? raw.codex_visible) !== false,
    contextWindow: Number(raw.contextWindow || raw.context_window || raw.context || 128000),
    maxOutputTokens: raw.maxOutputTokens || raw.max_output_tokens || null,
    inputModalities,
    reasoningLevel: raw.reasoningLevel || raw.reasoning_level || "medium",
    supportedReasoningLevels: normalizeReasoningLevels(raw.supportedReasoningLevels || raw.supported_reasoning_levels),
    supportsReasoningSummaries: raw.supportsReasoningSummaries ?? raw.supports_reasoning_summaries ?? false,
    defaultReasoningSummary: raw.defaultReasoningSummary || raw.default_reasoning_summary || "none",
    supportVerbosity: raw.supportVerbosity ?? raw.support_verbosity ?? false,
    defaultVerbosity: raw.defaultVerbosity || raw.default_verbosity || "low",
    supportsImageDetailOriginal: raw.supportsImageDetailOriginal ?? raw.supports_image_detail_original ?? null,
    effectiveContextWindowPercent: Number(raw.effectiveContextWindowPercent || raw.effective_context_window_percent || 0) || null,
    additionalSpeedTiers: normalizeStringArray(raw.additionalSpeedTiers || raw.additional_speed_tiers),
    serviceTiers: Array.isArray(raw.serviceTiers || raw.service_tiers) ? raw.serviceTiers || raw.service_tiers : [],
    useResponsesLite: raw.useResponsesLite ?? raw.use_responses_lite ?? null,
    toolMode: raw.toolMode || raw.tool_mode || "",
    supportsSearchTool: (raw.supportsSearchTool ?? raw.supports_search_tool) === true && Boolean(webSearchToolType),
    webSearchToolType,
    priority: raw.priority || Math.max(1, 1000 - index),
    profile: typeof raw.profile === "string" ? raw.profile : "",
    accountId: typeof raw.accountId === "string" ? raw.accountId : "",
    raw,
  };
}

function normalizeWebSearchToolType(value) {
  return value === "text" || value === "text_and_image" ? value : null;
}

function normalizeReasoningLevels(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item && typeof item.effort === "string").map((item) => ({
    effort: item.effort,
    description: typeof item.description === "string" ? item.description : "",
  }));
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

export function normalizeModalities(value) {
  if (!value) {
    return ["text"];
  }
  const modalities = Array.isArray(value) ? value : [value];
  const normalized = modalities.map((item) => String(item).trim()).filter(Boolean);
  return normalized.length ? normalized : ["text"];
}
