# Install Workflow

Trigger: `npm start` or `shimex install`

1. Run `npm install`.
2. Run `npm start`.
3. Detect the user's source Codex Desktop app.
4. Copy or refresh only the managed Shimex app when needed.
5. Reapply Shimex's app bundle patch and icon.
6. Write isolated Shimex Codex profile config.
7. Write the isolated, non-secret local API-key auth marker.
8. Mark Shimex first-run onboarding complete in the isolated profile state.
9. Start the Shimex server if needed.
10. Open the managed Shimex app.

macOS bundle writes are scoped to the managed app copy:

- `/Applications/Codex.app` is read-only upstream input.
- `~/Applications/Shimex.app` is the mutable cloned app.
- Icon updates replace or add `.icns` files in
  `Shimex.app/Contents/Resources/`.
- The bundle icon pointer is updated through
  `Shimex.app/Contents/Info.plist` `CFBundleIconFile`.

The original Codex app and normal Codex profile are never modified.
