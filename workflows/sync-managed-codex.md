# Sync Managed Codex Workflow

Trigger: `shimex sync`

1. Detect the source Codex app.
2. Compare source metadata with the managed Shimex app metadata.
3. If changed, plan a rebuild of the managed app from source.
4. Ask for approval before replacing the managed app.
5. Reapply Shimex-specific patch/config recipe.
6. Verify the managed app points at Shimex's profile and server.

The source Codex app is read-only input.

