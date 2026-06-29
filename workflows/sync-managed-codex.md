# Sync Managed Codex Workflow

Trigger: `shimex sync`

1. Detect the source Codex app.
2. Compare source metadata with the managed Shimex app metadata.
3. If changed, plan a rebuild of the managed app from source.
4. Ask for approval before replacing the managed app.
5. Reapply Shimex-specific patch/config recipe.
6. Refresh the managed app icon from `codex.icon_path`.
7. Rewrite the isolated profile, model catalog, and non-secret auth marker.
8. Verify the managed app points at Shimex's profile and server.

macOS bundle writes are scoped to the managed app copy:

- `/Applications/Codex.app` is read-only upstream input.
- `~/Applications/Shimex.app` is the mutable cloned app.
- Icon updates replace or add `.icns` files in
  `Shimex.app/Contents/Resources/`.
- The bundle icon pointer is updated through
  `Shimex.app/Contents/Info.plist` `CFBundleIconFile`.

The source Codex app is read-only input.
