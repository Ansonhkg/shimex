export const cursorComposerProvider = {
  id: "cursor-composer",
  displayName: "Cursor Composer",
  kind: "external-cli-session",
  protocol: "cursor-agent",
  auth: { type: "external-cli-login", command: "cursor-agent status" },
  capabilitySource: "static",
  requestAdapter: "cursor-agent-bridge",
  discoverModels() {
    return [
      {
        slug: "composer-2-5",
        displayName: "Composer 2.5",
        upstreamModel: "composer-2.5",
        contextWindow: 272000,
        inputModalities: ["text"],
        priority: 11000,
      },
    ];
  },
};
