# Shimex Agent Instructions

Shimex is a JavaScript/Node product that gives Codex Desktop a managed local
provider gateway.

## Product Contract

- The user must already have Codex Desktop installed.
- Shimex copies the user's Codex app into a managed Shimex app.
- Never mutate, patch, rename, or re-sign the original Codex app.
- `shimex.yml` is the configuration source of truth.
- Secrets must be referenced, not copied into source or config.
- Unknown provider capabilities stay unknown. Do not guess image, tool,
  context, or reasoning support.
- No legacy, fallback, or compatibility code paths unless a current migration
  reason is written beside the code with a removal condition.

## Architecture

Use these package boundaries:

- Semantic core owns provider-neutral types, config, models, capabilities,
  route metadata, catalog metadata, and diagnostics.
- Provider adapters own provider-specific auth, discovery, request shapes,
  streaming quirks, and model IDs.
- Client adapters own client-specific setup such as Codex app discovery,
  managed copy planning, isolated profile config, and model picker catalog.
- Server adapters expose OpenAI-compatible HTTP/SSE and admin routes.
- CLI adapters call product functions; they do not own product logic.
- Workflows document governed multi-step operations such as install, sync,
  provider onboarding, and model capability updates.

Dependency direction:

```text
CLI / HTTP / Admin UI
        -> product functions
        -> semantic core
        -> provider and client adapters
```

Core must not import provider modules directly. Composition happens in the
registry layer or app entrypoints.

## Provider Rules

To add a provider:

1. Add a provider module under `src/providers/<provider-id>/`.
2. Export a manifest with `id`, `displayName`, `kind`, `protocol`,
   `auth`, `capabilitySource`, and `requestAdapter`.
3. Register it in `src/providers/index.js`.
4. Add a `shimex.yml` example entry.
5. Add tests showing models appear in `/v1/models` and the Codex catalog.

OpenAI-compatible endpoint providers should use the shared
`openai-compatible` provider shape. Do not create a bespoke provider for a
normal OpenAI-compatible endpoint unless it has real auth, discovery, or
request behavior.

## Model Picker Rules

Models appear in Codex Desktop through normalized Shimex model metadata.

Required fields:

- `slug`
- `displayName`
- `providerId`
- `upstreamModel`
- `contextWindow`
- `inputModalities`

Image support requires all of:

- `inputModalities` includes `image`
- provider adapter can translate image parts for the upstream API
- Codex catalog entry sets `supports_image_detail_original: true`
- tests cover both image-capable and text-only models

Text-only models must reject image input clearly instead of dropping image
parts silently.

## Codex Client Rules

- Detect the source Codex app before install or sync.
- Copy from the source app into a managed Shimex app.
- Store Shimex's Codex profile separately from the user's normal Codex profile.
- Generated Codex config must point at Shimex's local `/v1` endpoint and model
  catalog.
- Any write to app bundles or profile config should have a dry-run plan and an
  explicit apply step.

## Commands

Use npm and the repo command center:

```bash
make help
make check
make test
make run
```

Useful CLI checks:

```bash
npm run shimex -- help
npm run shimex -- doctor
npm run shimex -- providers list
npm run shimex -- models list
```

## Quality Bar

- Keep source files small and split by ownership.
- Avoid broad utility folders.
- Add tests when changing provider metadata, model capability logic, catalog
  generation, config loading, or client install planning.
- Do not add fake LLM providers that pretend to test semantic behavior.
  Deterministic tests may cover schemas, config, catalog output, routing
  decisions, and adapter request construction.
