# Shimex behavior map

Shimex requires an existing Codex Desktop installation on macOS. It keeps the
installed Codex application and its normal profile outside Shimex's write
boundary. Shimex uses a separate runtime home for configuration-derived state,
provider model caches, pairing records, client sessions, generated catalogs,
and the managed Codex profile.

## Host startup and persistence

The default runtime is a local host gateway. Configuration is loaded after the
project environment file is read; shell variables take precedence over values
from that file. Provider secrets are referenced by environment-variable name,
not copied into the configuration model.

Host mode writes a persistent mode marker and can install a per-user macOS
LaunchAgent. The service starts the gateway at login, keeps it alive after a
crash, writes its output to the runtime log, and can be restarted without
opening the managed desktop app. A foreground server is also available for
development. The gateway exposes health, model, catalog, admin, pairing, and
model-request routes from the same HTTP server.

If a configured port is already in use, the server refuses to start rather
than silently selecting another port. A detached server records process
metadata and can be stopped by signal; if its process record is unavailable,
the local stop route is used as a recovery path.

## Managed desktop installation

An install or sync first reads metadata from the source Codex application and
the managed application. A dry-run plan reports whether the source exists,
which managed target would be replaced, and which profile and catalog outputs
would be written. Applying the plan refuses to operate when the source is
missing, when the managed target is not a Shimex application, or when the two
application paths are equal.

Applying the plan replaces only the managed application copy. On macOS the
copy is patched with Shimex metadata and icon assets, selected application
bundle changes, and an ad-hoc local signature. The original Codex bundle is
not modified. If the managed bundle is already present, startup compares its
version and build with the source and refreshes it when they differ; a managed
write failure falls back to rebuilding the managed copy.

The generated Codex profile is separate from the normal profile. It points the
Codex provider at Shimex's local gateway, names the generated model catalog,
seeds a local API-key marker, and marks first-run desktop onboarding complete.
The managed app is opened with a separate user-data directory and an explicit
profile-home environment variable. The gateway can therefore run independently
of whether the managed app window is open.

## Provider and model availability

Each enabled provider is resolved through a provider-neutral manifest. A
manifest identifies the provider, its protocol family, authentication mode,
capability source, and request adapter. Provider-specific authentication,
model discovery, request construction, streaming behavior, and model identity
remain inside the provider boundary.

Model discovery reads configured models, static provider models, local session
metadata, or a provider cache. Providers that support refresh can make a
best-effort startup refresh. A refresh failure does not erase usable
configured, cached, or static models. Normal catalog and request discovery
uses those local sources rather than requiring a live model-list network call.
External-session providers hide their models when the referenced local auth is
unavailable unless configuration explicitly allows unauthenticated display.

Every discovered model is normalized into a stable slug, display name,
provider identity, upstream model identifier, context window, input
modalities, reasoning metadata, search metadata, and visibility flags. Duplicate
slugs are made unique deterministically. The same normalized model data feeds
the OpenAI model list, the full Shimex status response, and the Codex picker
catalog.

The picker catalog filters hidden models and advertises only text and image
modalities. Image capability is meaningful only when the route also knows how
to translate image parts. A request containing an image is rejected before
upstream routing when the selected model is text-only. Search support stays
disabled unless both the model flag and a recognized search-tool type are
present.

## Request lifecycle

For every remote-capable request, Shimex first resolves access from the
request's bearer token and source address. Health, pairing redemption, and join
bootstrap routes are public. Loopback requests receive the local control-plane
boundary. Non-local requests require a valid, non-revoked client token and a
scope that matches the route.

The request router resolves the requested normalized model slug. It joins that
model with the enabled provider configuration and provider manifest, rejects
unsupported modalities, and dispatches to the manifest's adapter. Unknown
slugs return a typed 404; missing adapters return a typed 501; unavailable
provider authentication returns a typed 401.

Shimex accepts both Chat Completions and Responses-shaped requests. A shared
translation layer converts system and developer instructions, messages,
function calls, tool outputs, namespaces, reasoning metadata, and image parts
between provider protocols. OpenAI-compatible chat providers can receive a
Responses request as chat messages. Responses providers can receive chat as
input items. Anthropic receives translated messages, tool schemas, image
blocks, and preserved thinking envelopes.

Native upstream SSE is passed through after model identifiers and event shapes
are normalized. Where an upstream does not provide the needed stream shape,
Shimex buffers the upstream response and emits a synthetic SSE sequence. The
stream state machine closes text items, accumulates tool-call arguments, emits
completed function calls, and finishes the Responses lifecycle. Cursor's
external CLI bridge is text-oriented and cannot forward images or tools.

The virtual Auto Router filters configured candidates by existence, cost, and
image capability. It may ask a classifier to score candidates and caches the
decision. A classifier failure, invalid score, or no qualifying score falls
back to a configured default or the cheapest viable candidate. A recursive
redirect limit prevents route loops.

## External sessions and multiple accounts

ChatGPT/Codex profiles are stored in a runtime-local profile store with
access-token, refresh-token, account-id, expiry, and display metadata. A
profile can be added through device login, pasted OAuth JSON, or import from a
legacy Codex auth file. The default profile produces unqualified model rows;
each additional profile also produces profile-scoped picker rows. The selected
profile determines the upstream bearer token and account header.

Cline profiles follow the same model-scoping idea and can refresh an expiring
profile before a request. Grok reads its local session file and can refresh an
expiring token. Cursor delegates to the locally authenticated CLI process.
These sessions remain host-local and are never part of a client pairing
session.

## Host/client pairing

The host generates an invite from a local control surface. The invite contains
an expiring, one-time display code and an advertised gateway origin. The
pairing record keeps a hash of the code and, until consumption, the code needed
to display the active invite. Repeated failed redemption attempts are
rate-limited.

The client redeems the code over the already-reachable LAN or private network.
The host marks the code consumed, creates a random client token, stores only
its hash and a short prefix, assigns the default model-use and catalog-read
scopes, and returns the token once. The client persists the gateway URL,
client id, scopes, and token in a local session, then switches to client mode.

Client setup fetches the host model list and catalog. If Codex exists locally,
the client makes its own managed copy without transferring the large app
bundle. If Codex is absent, setup can download the host's managed bundle as a
fallback. In either case the client writes a separate profile whose base URL
is the host gateway and whose API key is the client token. The client does not
receive provider API keys, OAuth refresh tokens, or external-session files.

The default remote scopes allow model requests, model listing, status/model
metadata, catalog reads, and managed-bundle transfer. Configuration editing,
provider auth management, pairing administration, and host restart remain
local-only in the current HTTP handlers. An administrator scope exists in the
access policy, but it does not bypass those route-specific local checks. A host
can revoke one client or all clients; future requests using a revoked token
fail authorization.

The advertised URL is only an address-selection mechanism. It does not make a
loopback-bound gateway reachable. Remote use also requires the gateway to bind
to a reachable interface and the machines to have network reachability. The
HTTP transport is normally protected by the surrounding private network, so
the invite and client token must be treated as credentials for that trust
boundary.

## Failure and recovery behavior

Missing source Codex, missing models, invalid configuration, occupied ports,
unreachable providers, missing auth, expired one-time codes, revoked client
tokens, unsupported images, unknown model slugs, and unavailable desktop
bundles produce explicit failures rather than silently dropping capabilities.
Model refresh is intentionally best-effort, so a temporary provider outage can
leave the last usable cache in place. A saved client token that is rejected can
be replaced by redeeming a fresh invite code. A provider session may still
expire independently of the pairing token and must be renewed through its own
auth flow.
