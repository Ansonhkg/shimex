# Host / Client Pairing Workflow

Trigger: `shimex mode`, `shimex host code`, `shimex pair`, `shimex client setup`, `shimex client sync`

## Goal

One machine (host) keeps provider secrets and sessions. Another machine (client)
pairs with a short code and uses the host gateway, optionally with a managed
Shimex desktop app pointed at the host.

## Host

1. Configure providers and sign in on the host as usual.
2. Make the host reachable on LAN/Tailscale (bind/host/public URL as needed).
3. Set host mode:
   - `npm run shimex -- mode host`
4. Generate an invite:
   - `npm run shimex -- host code`
   - or admin UI → **Generate invite link**
5. Share the invite link with the client machine:
   - `http://host:5413/join?c=ABCD-EFGH`
   - or one-liner: `curl -fsSL 'http://host:5413/join/setup.sh?c=ABCD-EFGH' | bash`
6. Review/revoke clients:
   - `npm run shimex -- host clients`
   - `npm run shimex -- host revoke <client-id>`
   - `npm run shimex -- host revoke-all`

## Client

Easiest:
1. Open the invite link from the host (`/join?c=...`)
2. Or run the one-liner setup script from the host invite
3. Script saves client session and runs desktop setup when possible

Manual:
1. `npm run shimex -- pair --from-url 'http://host:5413/join?c=ABCD-EFGH'`
   or `npm run shimex -- pair 'ABCD-EFGH@host:5413'`
2. `npm run shimex -- client setup --open`

When the host adds or updates models, refresh the client's local Codex picker
catalog without reinstalling the app:

- Repository checkout: `npm run shimex -- client sync`
- One-line bootstrap client: `~/.shimex/sync-model-catalog.sh`

Fully quit and reopen the managed `Shimex.app` after syncing so Codex Desktop
reloads the catalog. Inference continues to use the host gateway and provider
credentials never move to the client.

Shimex stores only:
- host gateway URL
- client token
- client id / scopes

If Codex.app is missing, pairing still works for OpenAI-compatible clients:
- base URL: `http://host:5413/v1`
- auth: `Bearer <client-token>`

## Security boundary

- Pairing codes expire and are one-time.
- Ongoing access uses a revocable client token.
- Provider secrets never leave the host.
- Default client scopes: `models:use`, `catalog:read`.
- Host admin actions remain local-only unless a client has explicit `admin` scope.

## Notes

- Pairing assumes network reachability already exists (LAN/Tailscale).
- Host mode control endpoints (`/api/pair/code`, revoke, mode changes) are local-only.
- `/api/pair` is reachable so clients can redeem codes.
