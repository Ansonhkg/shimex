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
npm run shimex -- help
npm run shimex -- doctor
npm run shimex -- providers list
npm run shimex -- models list
npm run shimex -- server start
```

Open the admin UI at:

```text
http://127.0.0.1:18765/admin
```

## Provider Families

Shimex is being ported from `codex-shim` with these provider families:

- OpenAI-compatible chat endpoints
- OpenAI Responses-compatible endpoints
- Anthropic Messages
- Cloudflare Workers AI
- Ollama and LM Studio local OpenAI-compatible endpoints
- ChatGPT/Codex passthrough
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
