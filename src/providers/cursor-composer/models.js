const EFFORT_ORDER = ["none", "low", "medium", "high", "xhigh", "max"];

const EFFORT_DESCRIPTIONS = {
  none: "No extended reasoning",
  low: "Faster, lighter reasoning",
  medium: "Balanced speed and reasoning",
  high: "Deeper reasoning",
  xhigh: "Maximum reasoning where Cursor offers it",
  max: "Maximum reasoning where Cursor offers it",
};

const EFFORT_SUFFIXES = [
  ["extra-high", "xhigh"],
  ["xhigh", "xhigh"],
  ["medium", "medium"],
  ["high", "high"],
  ["low", "low"],
  ["none", "none"],
  ["max", "max"],
];

/**
 * Cursor Agent exposes exact executable variants (for example
 * `gpt-5.5-high-fast`) rather than a structured capability document. Turn
 * those exact IDs into one picker model per family, retaining only variant
 * combinations the CLI actually listed.
 */
export function normalizeCursorAgentModels(entries, fallbackModels = []) {
  const fallbackByUpstream = new Map(fallbackModels.map((model) => [model.upstreamModel, model]));
  const groups = new Map();

  for (const [index, entry] of entries.entries()) {
    const upstreamModel = String(entry?.id || "").trim();
    if (!upstreamModel) {
      continue;
    }
    const variant = parseCursorVariant(upstreamModel, entry.displayName);
    let group = groups.get(variant.baseId);
    if (!group) {
      group = {
        baseId: variant.baseId,
        displayName: variant.displayName,
        priority: 11000 - index,
        variants: new Map(),
      };
      groups.set(variant.baseId, group);
    }
    const effort = variant.effort || "default";
    const variants = group.variants.get(effort) || {};
    const speed = variant.fast ? "fast" : "standard";
    if (!variants[speed]) {
      variants[speed] = upstreamModel;
    }
    group.variants.set(effort, variants);
  }

  return [...groups.values()].map((group) => cursorModelFromGroup(group, fallbackByUpstream)).filter(Boolean);
}

function cursorModelFromGroup(group, fallbackByUpstream) {
  const defaultVariants = group.variants.get("default") || {};
  const reasoningVariants = new Map(
    [...group.variants.entries()].filter(([effort]) => effort !== "default"),
  );

  // Cursor's unqualified IDs (such as `gpt-5.3-codex`) are its default
  // variant. Where that family also has explicit efforts, expose it as
  // Medium—the CLI lists it between Low and High and Cursor supplies no other
  // structured label for it.
  if (hasVariant(defaultVariants) && reasoningVariants.size && !reasoningVariants.has("medium")) {
    reasoningVariants.set("medium", defaultVariants);
  }

  const efforts = [...reasoningVariants.keys()].sort((left, right) => effortIndex(left) - effortIndex(right));
  const defaultEffort = efforts.includes("medium")
    ? "medium"
    : efforts[0] || "medium";
  const defaultVariant = firstAvailable(
    reasoningVariants.get(defaultEffort),
    defaultVariants,
    ...reasoningVariants.values(),
  );
  if (!defaultVariant) {
    return null;
  }

  const fallback = fallbackByUpstream.get(group.baseId) || fallbackByUpstream.get(defaultVariant);
  const selectableVariants = efforts.length
    ? efforts.map((effort) => reasoningVariants.get(effort))
    : [defaultVariants];
  const supportsFast = selectableVariants.length > 0
    && selectableVariants.every((variants) => variants?.standard && variants?.fast);

  return {
    slug: fallback?.slug || `cursor-${slugify(group.baseId)}`,
    displayName: fallback?.displayName || group.displayName,
    upstreamModel: defaultVariant,
    // Cursor does not expose reliable context or modality metadata through its
    // CLI. Keep the existing conservative defaults.
    contextWindow: fallback?.contextWindow || 128000,
    inputModalities: fallback?.inputModalities || ["text"],
    priority: fallback?.priority || group.priority,
    reasoningLevel: defaultEffort,
    supportedReasoningLevels: efforts.map((effort) => ({
      effort,
      description: EFFORT_DESCRIPTIONS[effort] || "Cursor-provided reasoning variant",
    })),
    // An empty list is deliberate for fixed Cursor models: do not invent an
    // Effort control when the CLI listed no reasoning variants.
    reasoningLevelsKnown: true,
    additionalSpeedTiers: supportsFast ? ["fast"] : [],
    variantMap: {
      default: defaultVariants,
      reasoning: Object.fromEntries(reasoningVariants),
    },
  };
}

function parseCursorVariant(id, displayName) {
  let baseId = id;
  const fast = baseId.endsWith("-fast");
  if (fast) {
    baseId = baseId.slice(0, -"-fast".length);
  }

  let effort = null;
  for (const [suffix, normalized] of EFFORT_SUFFIXES) {
    if (baseId.endsWith(`-${suffix}`)) {
      baseId = baseId.slice(0, -suffix.length - 1);
      effort = normalized;
      break;
    }
    // Cursor sometimes puts an effort immediately before a mode suffix, e.g.
    // `claude-4.6-sonnet-medium-thinking`.
    if (baseId.endsWith(`-${suffix}-thinking`)) {
      baseId = `${baseId.slice(0, -`-${suffix}-thinking`.length)}-thinking`;
      effort = normalized;
      break;
    }
  }

  return {
    baseId,
    effort,
    fast,
    displayName: cursorFamilyDisplayName(displayName || id),
  };
}

function cursorFamilyDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+Fast$/i, "")
    .replace(/\s+(?:Extra High|High|Medium|Low|Max|None)(?=\s+(?:Thinking|\(NO ZDR\)))/i, "")
    .replace(/\s+(?:Extra High|High|Medium|Low|Max|None)$/i, "")
    .trim() || String(value || "").trim();
}

function firstAvailable(...variants) {
  for (const value of variants) {
    if (value?.standard) {
      return value.standard;
    }
    if (value?.fast) {
      return value.fast;
    }
  }
  return "";
}

function hasVariant(variants) {
  return Boolean(variants?.standard || variants?.fast);
}

function effortIndex(effort) {
  const index = EFFORT_ORDER.indexOf(effort);
  return index >= 0 ? index : EFFORT_ORDER.length;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";
}
