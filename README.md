# Shimex

Shimex is a local JavaScript/Node provider gateway for Codex Desktop.

It expects the user to have Codex Desktop installed, copies that app into a
managed Shimex app, and points the managed copy at a local OpenAI-compatible
server and generated model catalog. The original Codex app remains untouched.

## Current Shape

- `shimex.yml` as the source of truth.
- Provider modules for the Codex-shim provider families.
- Request adapters for OpenAI-compatible chat, OpenAI Responses-compatible,
  Anthropic Messages, ClinePass, ChatGPT/Codex passthrough, Cursor Composer,
  and Auto Router fallback routing.
- Cache-backed provider model refresh for ClinePass recommended models and
  OpenAI-compatible `/models` endpoints when `models.refresh: on_start` is set.
- Codex Desktop as the only client target.
- Bare local admin UI exposed by the Shimex server.

## Quick Start

```bash
cd ~/Projects/shimex
npm install
npm start
```

`npm start` prepares the managed `Shimex.app`, writes the isolated Shimex Codex
profile, starts the local gateway if needed, and opens the app.

Provider secrets can live in a local `.env` file in the Shimex repo. Shell
environment variables win over `.env` values.

```bash
cp .env.example .env
```

Useful lower-level commands:

```bash
npm run shimex -- help
npm run status
npm run stop
npm run dev
npm run shimex -- doctor
npm run shimex -- providers list
npm run shimex -- models list
npm run shimex -- server start
```

`npm start` starts the Shimex backend as a detached local process when it is
not already running. `npm run status` shows the health, pid, and log path;
`npm run stop` stops the backend through the pid file or local stop endpoint;
`npm run dev` runs the server in the foreground and opens the managed app for
debugging.

Open the admin UI at:

```text
http://127.0.0.1:18765/admin
```

## macOS Signing And Keychain Prompt

Shimex modifies only the managed app copy at `~/Applications/Shimex.app`; the
upstream `/Applications/Codex.app` remains untouched.

Because Shimex patches the copied app bundle, including metadata, icons, and
`app.asar`, the original Codex code signature no longer matches that managed
copy. Shimex therefore applies an ad-hoc local signature to `Shimex.app` so
macOS can launch and register the modified bundle consistently.

On first launch, macOS may show a prompt like:

```text
Shimex wants to access key "Codex Storage Key" in your keychain.
```

That prompt is macOS asking whether the re-signed managed app may read the
local Keychain item that Codex/Electron uses for encrypted local storage. It is
not an OpenAI sign-in prompt, and it does not delete or rewrite session files.
Allowing it lets the managed app behave like Codex without encrypted-storage
failures.

## Provider Families

Shimex is being ported from `codex-shim` with these provider families:

- OpenAI-compatible chat endpoints
- OpenAI Responses-compatible endpoints
- Anthropic Messages
- DeepSeek's Anthropic-compatible endpoint
- Cloudflare Workers AI
- Ollama and LM Studio local OpenAI-compatible endpoints
- ChatGPT/Codex passthrough, disabled by default because it requires an
  external Codex/ChatGPT auth token outside Shimex's isolated local profile
- Cursor Composer passthrough
- ClinePass
- Auto Router virtual model

Otteriki is intentionally not a bespoke provider. It should work as an
OpenAI-compatible endpoint when configured.

Cursor Composer is exposed as text-only in Shimex because the current bridge
uses `cursor-agent` prompt input rather than a native image transport.

## Model Discovery

Configured `models` entries are always used as written. Providers can also
refresh model caches during `server start`, `install --apply`, and
`sync --apply` when configured with:

```yaml
models:
  refresh: on_start
```

Refresh is best-effort. If the upstream endpoint or auth is unavailable,
Shimex keeps using configured models, cached models, or the provider's static
fallback list.

## Auto Router

`auto-router` can choose among configured candidate slugs. Without a
classifier, it routes to the cheapest viable candidate and skips text-only
models for image requests. With `classifier` configured, Shimex asks that model
to score candidates and chooses the cheapest candidate above `threshold`.

```yaml
- id: auto-router
  enabled: true
  slug: shimex-auto
  classifier: classifier-model-slug
  threshold: 0.7
  default: balanced-model-slug
  cache: true
  candidates:
    - slug: cheap-model-slug
      cost: 1
      card: Fast, low-cost edits.
    - slug: strong-model-slug
      cost: 5
      card: Hard debugging and architecture work.
```
