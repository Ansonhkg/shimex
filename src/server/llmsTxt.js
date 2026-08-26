import { expandHome } from "../core/paths.js";

export function generateLlmsTxt(models, config = {}) {
  const profileHome = expandHome(config.codex?.profileHome || "~/.shimex/codex-profile");
  const available = Array.isArray(models) ? models : [];
  const lines = [
    "# Shimex",
    "",
    "> Shimex is a local OpenAI-compatible provider gateway for Codex Desktop.",
    "",
    "This document is generated from the models currently discovered by this Shimex host. It never includes provider credentials. A model appears here only when its provider is enabled and, for subscription providers, its local session is available.",
    "",
    "## Commands",
    "",
    "List the current model catalog:",
    "",
    "```sh",
    "npm run shimex -- models list",
    "```",
    "",
    "Run a one-off prompt through Shimex:",
    "",
    "```sh",
    "npm run shimex -- exec --model <MODEL_SLUG> \"YOUR PROMPT\"",
    "```",
    "",
    "Start a new Codex thread using a Shimex model:",
    "",
    "```sh",
    `CODEX_HOME=${shellQuote(profileHome)} codex --model <MODEL_SLUG> \"YOUR PROMPT\"`,
    "```",
    "",
    "Resume a Codex thread using a Shimex model:",
    "",
    "```sh",
    `CODEX_HOME=${shellQuote(profileHome)} codex resume <THREAD_ID> --model <MODEL_SLUG> \"YOUR PROMPT\"`,
    "```",
    "",
    "Use `codex resume --last` in place of `codex resume <THREAD_ID>` to continue the most recent thread.",
    "",
    ...apiReference(profileHome),
    "## Available models",
    "",
  ];

  if (!available.length) {
    lines.push("No models are currently available. Check provider configuration and local subscription sessions, then refresh Shimex.");
    return `${lines.join("\n")}\n`;
  }

  for (const model of available) {
    const metadata = [
      `provider: ${plain(model.providerDisplayName || model.providerId)}`,
      `input: ${(model.inputModalities || ["text"]).map(plain).join(", ")}`,
      `context: ${formatContextWindow(model.contextWindow)}`,
    ];
    const efforts = (model.supportedReasoningLevels || []).map((level) => plain(level?.effort)).filter(Boolean);
    if (efforts.length) {
      metadata.push(`reasoning: ${efforts.join(", ")}`);
    }
    lines.push(`### ${plain(model.displayName)}`);
    lines.push("");
    lines.push(`- Model slug: \`${inlineCode(model.slug)}\``);
    lines.push(`- ${metadata.join("; ")}`);
    lines.push("- Direct command:");
    lines.push("");
    lines.push("  ```sh");
    lines.push(`  npm run shimex -- exec --model ${shellQuote(model.slug)} \"YOUR PROMPT\"`);
    lines.push("  ```");
    lines.push("- Codex thread command:");
    lines.push("");
    lines.push("  ```sh");
    lines.push(`  CODEX_HOME=${shellQuote(profileHome)} codex resume <THREAD_ID> --model ${shellQuote(model.slug)} \"YOUR PROMPT\"`);
    lines.push("  ```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function apiReference(profileHome) {
  return [
    "## HTTP API",
    "",
    "Base URL: `https://shimex.localhost` (direct fallback: `http://127.0.0.1:5413`). Responses are JSON unless the endpoint is a streamed model response, desktop archive, shell script, HTML page, or this text document.",
    "",
    "### Access",
    "",
    "- Loopback requests have full host access.",
    "- Remote clients send `Authorization: Bearer <CLIENT_TOKEN>`, obtained by pairing with the host.",
    "- `models:use` permits model requests and model discovery. `catalog:read` permits catalog and `llms.txt` reads. Configuration, provider-session, install, and host-control endpoints are host-local only.",
    "- `GET /health`, `GET /join`, `GET /join/setup.sh`, and `POST /api/pair` are bootstrap endpoints.",
    "",
    "### OpenAI-compatible gateway",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/v1/models` | OpenAI-shaped list of the currently discovered model slugs. |",
    "| `POST` | `/v1/chat/completions` | Chat Completions request; supports streaming SSE. |",
    "| `POST` | `/v1/responses` | Responses request; supports streaming SSE. |",
    "| `POST` | `/v1/responses/compact` | Compact Responses request; Shimex forces non-streaming output. |",
    "",
    "List models:",
    "",
    "```sh",
    "curl -fsS https://shimex.localhost/v1/models",
    "```",
    "",
    "Chat Completions example:",
    "",
    "```sh",
    "curl -fsS https://shimex.localhost/v1/chat/completions \\",
    "  -H 'content-type: application/json' \\",
    "  -d '{\"model\":\"<MODEL_SLUG>\",\"messages\":[{\"role\":\"user\",\"content\":\"YOUR PROMPT\"}],\"stream\":false}'",
    "```",
    "",
    "Responses example:",
    "",
    "```sh",
    "curl -fsS https://shimex.localhost/v1/responses \\",
    "  -H 'content-type: application/json' \\",
    "  -d '{\"model\":\"<MODEL_SLUG>\",\"input\":\"YOUR PROMPT\",\"stream\":false}'",
    "```",
    "",
    "For a paired remote host, add `-H \"Authorization: Bearer $SHIMEX_CLIENT_TOKEN\"` to the request.",
    "",
    "### Catalog and documentation",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/api/models` | Full normalized Shimex model metadata. |",
    "| `GET` | `/api/status` | Doctor status, models, generated Codex catalog, and access context. |",
    "| `GET` | `/codex/model-catalog.json` | Generated Codex Desktop model-picker catalog. |",
    "| `GET` | `/llms.txt` | This generated model and API reference. |",
    "| `GET` | `/health` | Minimal health response. |",
    "",
    "### Pairing and client setup",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/join?c=<DISPLAY_CODE>` | Host invite page. |",
    "| `GET` | `/join/setup.sh?c=<DISPLAY_CODE>` | Client bootstrap script. |",
    "| `POST` | `/api/pair` | Redeem a display code. Body: `{\"displayCode\":\"…\",\"clientLabel\":\"…\"}`. |",
    "| `GET` | `/api/access` | Host mode, advertised URL, active codes, and paired clients (host-local). |",
    "| `POST` | `/api/mode` | Set host/client mode. Body: `{\"mode\":\"host\"}` or `{\"mode\":\"client\"}` (host-local). |",
    "| `POST` | `/api/pair/code` | Create a pairing code (host-local). |",
    "| `GET` | `/api/pair/codes` | List active pairing codes (host-local). |",
    "| `GET` | `/api/pair/clients` | List paired clients (host-local). |",
    "| `DELETE` | `/api/pair/clients/{clientId}` | Revoke one paired client (host-local). |",
    "| `POST` | `/api/pair/clients/revoke-all` | Revoke every paired client (host-local). |",
    "",
    "### Managed app and host control",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/api/desktop/bundle` | Managed Shimex.app availability and metadata. |",
    "| `GET` | `/api/desktop/shimex.app.tgz` | Download the managed app archive. |",
    "| `POST` | `/api/install?apply=1` | Plan or apply managed-app installation (host-local). |",
    "| `POST` | `/api/sync?apply=1` | Plan or apply managed-app/profile synchronization (host-local). |",
    "| `POST` | `/api/open` | Open the managed Shimex.app (host-local). |",
    "| `POST` | `/api/stop` | Stop the gateway (host-local). |",
    "| `POST` | `/api/host/restart` | Restart the persistent host service (host-local). |",
    "| `GET` | `/admin` | Local admin dashboard. |",
    "",
    "### Configuration and environment",
    "",
    "All routes in this section are host-local. Secrets are never returned by the generated document.",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET`, `PUT` | `/api/config` | Read or write `shimex.yml`. |",
    "| `POST` | `/api/config/validate` | Validate proposed `shimex.yml` text. |",
    "| `GET` | `/api/config/providers` | List editable provider sections. |",
    "| `PUT` | `/api/config/providers/{providerId}` | Replace one provider section. |",
    "| `GET`, `PUT` | `/api/env` | Read or write the local `.env` file. |",
    "| `POST` | `/api/env/validate` | Validate proposed `.env` text. |",
    "",
    "### Provider-session APIs",
    "",
    "All routes in this section are host-local because they inspect or change a local subscription session.",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET`, `POST` | `/api/codex-auths` | List or add ChatGPT/Codex profiles. |",
    "| `POST` | `/api/codex-auths/start-device` | Start ChatGPT/Codex device login. |",
    "| `GET` | `/api/codex-auths/device/{id}` | Poll ChatGPT/Codex device login. |",
    "| `POST` | `/api/codex-auths/device/{id}/complete` | Commit ChatGPT/Codex device login. |",
    "| `DELETE` | `/api/codex-auths/device/{id}/cancel` | Cancel ChatGPT/Codex device login. |",
    "| `POST` | `/api/codex-auths/{name}/use`, `/rename`, `/renew` | Select, rename, or refresh a profile. |",
    "| `GET` | `/api/codex-auths/{name}/usage`, `/credits` | Read normalized usage or credits. |",
    "| `DELETE` | `/api/codex-auths/{name}` | Remove a profile. |",
    "| `GET`, `POST` | `/api/cline-auths` | List or add ClinePass profiles. |",
    "| `POST` | `/api/cline-auths/start-device` | Start ClinePass device login. |",
    "| `GET` | `/api/cline-auths/device/{id}` | Poll ClinePass device login. |",
    "| `POST` | `/api/cline-auths/device/{id}/complete` | Commit ClinePass device login. |",
    "| `DELETE` | `/api/cline-auths/device/{id}/cancel` | Cancel ClinePass device login. |",
    "| `POST` | `/api/cline-auths/{name}/use`, `/rename`, `/renew` | Select, rename, or refresh a profile. |",
    "| `GET` | `/api/cline-auths/{name}/usage` | Read normalized ClinePass usage. |",
    "| `DELETE` | `/api/cline-auths/{name}` | Remove a profile. |",
    "| `GET` | `/api/grok-auth` | Read Grok session status. |",
    "| `GET` | `/api/grok-auth/usage` | Read normalized Grok subscription usage. |",
    "| `GET` | `/api/cursor-auth` | Read Cursor Agent session status. |",
    "| `POST` | `/api/cursor-auth/login` | Start Cursor's browser login. |",
    "| `GET` | `/api/cursor-auth/login/{id}` | Poll Cursor browser login. |",
    "| `POST` | `/api/cursor-auth/refresh` | Refresh the authenticated Cursor model cache. |",
    "| `GET` | `/admin/codex-auth/device?id={id}` | ChatGPT/Codex device-login page. |",
    "| `GET` | `/admin/cline-auth/device?id={id}` | ClinePass device-login page. |",
    "",
    `The Codex commands above use Shimex's isolated profile at ${inlineCode(profileHome)}.`,
    "",
  ];
}

function formatContextWindow(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `${amount} tokens` : "unknown";
}

function plain(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inlineCode(value) {
  return plain(value).replaceAll("`", "\\`");
}

function shellQuote(value) {
  return `'${String(value || "").replaceAll("'", "'\\\"'\\\"'")}'`;
}
