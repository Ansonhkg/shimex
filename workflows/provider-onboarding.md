# Provider Onboarding Workflow

Trigger: adding or updating a provider in `shimex.yml`.

1. Resolve the provider manifest.
2. Validate auth references without printing secret values.
3. Discover or load configured models.
4. Normalize capabilities.
5. Generate Codex catalog entries.
6. Wire the provider to a protocol adapter in `src/providers/adapter.js`.
7. Run deterministic provider conformance tests for model listing, catalog
   metadata, request body mapping, auth headers, and unsupported modality
   rejection.
8. Show the model picker impact.

Image support is explicit: the provider must declare image input support and
the adapter must translate image request parts.
