export const autoRouterProvider = {
  id: "auto-router",
  displayName: "Auto Router",
  kind: "virtual",
  protocol: "shimex-route-policy",
  auth: { type: "none" },
  capabilitySource: "configured-candidates",
  requestAdapter: "route-policy",
  discoverModels(config) {
    if (!config.options.enabled) {
      return [];
    }
    return [{
      slug: config.options.slug || "shimex-auto",
      displayName: config.options.display_name || "Auto Router",
      upstreamModel: config.options.slug || "shimex-auto",
      contextWindow: 400000,
      inputModalities: ["text", "image"],
      priority: 12000,
    }];
  },
};

