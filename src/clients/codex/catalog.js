const PLAN_TIERS = ["free", "plus", "pro", "team", "business", "enterprise"];
const WEB_SEARCH_TOOL_TYPES = new Set(["text", "text_and_image"]);

export function generateCodexCatalog(models) {
  return {
    models: models
      .filter((model) => model.codexVisible !== false)
      .map((model, index) => codexCatalogEntry(model, index)),
  };
}

export function codexCatalogEntry(model, index = 0) {
  const context = model.contextWindow || 128000;
  const inputModalities = codexInputModalities(model.inputModalities);
  const supportsImages = inputModalities.includes("image");
  const supportedReasoningLevels = model.supportedReasoningLevels?.length
    ? model.supportedReasoningLevels
    : defaultReasoningLevels();
  const displayName = codexDisplayName(model);
  const providerName = model.providerDisplayName || model.providerId || "Shimex";
  const webSearchToolType = WEB_SEARCH_TOOL_TYPES.has(model.webSearchToolType) ? model.webSearchToolType : null;
  const supportsSearch = model.supportsSearchTool === true && Boolean(webSearchToolType);
  return {
    slug: model.slug,
    display_name: displayName,
    description: `${model.displayName} routed through ${providerName} via Shimex.`,
    context_window: context,
    max_context_window: context,
    ...(model.effectiveContextWindowPercent
      ? { effective_context_window_percent: model.effectiveContextWindowPercent }
      : {}),
    auto_compact_token_limit: Math.max(8000, Math.floor(context * 0.8)),
    truncation_policy: {
      mode: "tokens",
      limit: Math.min(64000, Math.max(8000, Math.floor(context * 0.32))),
    },
    default_reasoning_level: model.reasoningLevel || "medium",
    supported_reasoning_levels: supportedReasoningLevels,
    default_reasoning_summary: model.defaultReasoningSummary || "none",
    reasoning_summary_format: "none",
    supports_reasoning_summaries: model.supportsReasoningSummaries ?? false,
    default_verbosity: model.defaultVerbosity || "low",
    support_verbosity: model.supportVerbosity ?? false,
    apply_patch_tool_type: "freeform",
    ...(webSearchToolType ? { web_search_tool_type: webSearchToolType } : {}),
    supports_search_tool: supportsSearch,
    supports_parallel_tool_calls: true,
    experimental_supported_tools: [],
    input_modalities: inputModalities,
    supports_image_detail_original: model.supportsImageDetailOriginal ?? supportsImages,
    shell_type: "shell_command",
    visibility: "list",
    minimal_client_version: "0.0.1",
    supported_in_api: true,
    availability_nux: null,
    upgrade: null,
    priority: model.priority || Math.max(1, 1000 - index),
    ...(model.additionalSpeedTiers?.length ? { additional_speed_tiers: model.additionalSpeedTiers } : {}),
    ...(model.serviceTiers?.length ? { service_tiers: model.serviceTiers } : {}),
    ...(model.useResponsesLite == null ? {} : { use_responses_lite: model.useResponsesLite }),
    ...(model.toolMode ? { tool_mode: model.toolMode } : {}),
    prefer_websockets: false,
    available_in_plans: PLAN_TIERS,
    base_instructions: `You are Codex, a coding agent powered by ${model.displayName} through ${providerName} via Shimex.`,
    model_messages: {
      instructions_template: `You are Codex, a coding agent powered by ${model.displayName} through ${providerName} via Shimex.`,
      instructions_variables: { model_name: model.displayName },
    },
  };
}

function defaultReasoningLevels() {
  return [
    { effort: "low", description: "Faster, lighter reasoning" },
    { effort: "medium", description: "Balanced speed and reasoning" },
    { effort: "high", description: "Deeper reasoning" },
    { effort: "xhigh", description: "Maximum reasoning where supported" },
  ];
}

function codexDisplayName(model) {
  if (model.codexDisplayName) {
    return model.codexDisplayName;
  }
  const providerName = model.providerDisplayName || model.providerId;
  if (["chatgpt-codex", "cline-pass"].includes(model.providerId) && model.profile && model.displayName.includes(":")) {
    return model.displayName;
  }
  if (!providerName) {
    return model.displayName;
  }
  if (model.displayName.toLowerCase().startsWith(`${providerName.toLowerCase()}:`)) {
    return model.displayName;
  }
  return `${providerName}: ${model.displayName}`;
}

function codexInputModalities(inputModalities = []) {
  const supported = inputModalities.filter((modality) => modality === "text" || modality === "image");
  return supported.length ? supported : ["text"];
}
