export function buildJoinSetupScript({
  gateway = "",
  token = "",
  clientId = "",
  code = "",
  hostOrigin = "",
} = {}) {
  const resolvedGateway = String(gateway || hostOrigin || "").replace(/\/+$/, "");
  // Fully self-contained client bootstrap:
  // pair -> save session -> ensure managed app (local Codex preferred, host transfer fallback)
  // -> write remote profile -> open app.
  const script = `#!/usr/bin/env bash
set -euo pipefail

echo "Shimex client setup"
echo "==================="

GATEWAY=${shellQuote(resolvedGateway)}
CLIENT_TOKEN=${shellQuote(token)}
CLIENT_ID=${shellQuote(clientId)}
PAIR_CODE=${shellQuote(code)}
SOURCE_CODEX="\${SHIMEX_SOURCE_CODEX:-/Applications/Codex.app}"
MANAGED_APP="\${SHIMEX_MANAGED_APP:-\$HOME/Applications/Shimex.app}"
PROFILE_HOME="\${SHIMEX_PROFILE_HOME:-\$HOME/.shimex/codex-profile}"
USER_DATA_DIR="\${SHIMEX_USER_DATA_DIR:-\$HOME/.shimex/codex-user-data}"
RUNTIME_HOME="\${SHIMEX_RUNTIME_HOME:-\$HOME/.shimex}"

need() {
  if ! command -v "\$1" >/dev/null 2>&1; then
    echo "Missing required command: \$1" >&2
    exit 1
  fi
}

need curl
need python3

EXISTING_SESSION_PATH="$RUNTIME_HOME/client-session.json"
if [[ -z "\${CLIENT_TOKEN}" && -f "\${EXISTING_SESSION_PATH}" ]]; then
  EXISTING_GATEWAY=\$(python3 -c 'import json,sys; print(str(json.load(open(sys.argv[1])).get("gatewayUrl","")).rstrip("/"))' "\$EXISTING_SESSION_PATH" 2>/dev/null || true)
  if [[ "\${EXISTING_GATEWAY}" == "\${GATEWAY}" ]]; then
    CLIENT_TOKEN=\$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("clientToken",""))' "\$EXISTING_SESSION_PATH" 2>/dev/null || true)
    CLIENT_ID=\$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("clientId",""))' "\$EXISTING_SESSION_PATH" 2>/dev/null || true)
  fi
fi

if [[ -n "\${CLIENT_TOKEN}" ]]; then
  AUTH_STATUS=\$(curl -sS -o /dev/null -w '%{http_code}' \\
    -H "authorization: Bearer \$CLIENT_TOKEN" "\$GATEWAY/v1/models" || true)
  if [[ "\${AUTH_STATUS}" == "401" || "\${AUTH_STATUS}" == "403" ]]; then
    if [[ -n "\${PAIR_CODE}" ]]; then
      echo "1/5 Saved client token is no longer accepted — pairing again..."
      CLIENT_TOKEN=""
      CLIENT_ID=""
    else
      echo "Saved client token is no longer accepted. Ask the host for a fresh invite." >&2
      exit 1
    fi
  elif [[ ! "\${AUTH_STATUS}" =~ ^2[0-9][0-9]\$ ]]; then
    echo "Could not validate the host connection (HTTP \${AUTH_STATUS:-000})." >&2
    exit 1
  fi
fi

if [[ -z "\${CLIENT_TOKEN}" && -n "\${PAIR_CODE}" ]]; then
  if [[ -z "\${AUTH_STATUS:-}" ]]; then
    echo "1/5 Pairing with host..."
  fi
  HOSTPORT="\${GATEWAY#*://}"
  if ! RESPONSE=\$(curl -fsSL -X POST "\$GATEWAY/api/pair" \\
    -H "content-type: application/json" \\
    -d "{\\"displayCode\\":\\"\${PAIR_CODE}@\${HOSTPORT}\\",\\"clientLabel\\":\\"\$(hostname 2>/dev/null || echo client)\\"}"); then
    echo "Pairing failed. Ask the host for a fresh client command." >&2
    exit 1
  fi
  CLIENT_TOKEN=\$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("clientToken",""))' <<<"\$RESPONSE")
  CLIENT_ID=\$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("clientId",""))' <<<"\$RESPONSE")
  NEXT_GATEWAY=\$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("gatewayUrl","") or "")' <<<"\$RESPONSE")
  if [[ -n "\${NEXT_GATEWAY}" ]]; then GATEWAY="\${NEXT_GATEWAY}"; fi
else
  echo "1/5 Using existing client token..."
fi

if [[ -z "\${CLIENT_TOKEN}" || -z "\${GATEWAY}" ]]; then
  echo "Pairing failed. Ask the host for a fresh invite." >&2
  exit 1
fi

HOME_DIR="\${HOME:-}"
if [[ -z "\${HOME_DIR}" ]]; then
  echo "HOME is not set" >&2
  exit 1
fi

mkdir -p "\$RUNTIME_HOME" "\$PROFILE_HOME" "\$USER_DATA_DIR" "\$(dirname "\$MANAGED_APP")"
SESSION_PATH="\$RUNTIME_HOME/client-session.json"
MODE_PATH="\$RUNTIME_HOME/mode.json"
CATALOG_PATH="\$RUNTIME_HOME/codex-model-catalog.json"
CONFIG_PATH="\$PROFILE_HOME/config.toml"
AUTH_PATH="\$PROFILE_HOME/auth.json"

python3 - "\$SESSION_PATH" "\$MODE_PATH" "\$GATEWAY" "\$CLIENT_TOKEN" "\$CLIENT_ID" <<'PY'
from pathlib import Path
import json, sys
from datetime import datetime, timezone
session_path, mode_path, gateway, token, client_id = sys.argv[1:6]
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
session = {
  "version": 1,
  "gatewayUrl": gateway.rstrip("/"),
  "clientToken": token,
  "clientId": client_id,
  "hostLabel": "",
  "scopes": ["models:use", "catalog:read"],
  "pairedAt": now,
  "updatedAt": now,
}
Path(session_path).write_text(json.dumps(session, indent=2) + "\\n")
Path(mode_path).write_text(json.dumps({"version": 1, "mode": "client", "updatedAt": now}, indent=2) + "\\n")
print(f"   Saved {session_path}")
PY

TOKEN_PREFIX="\${CLIENT_TOKEN:0:8}"
echo "   Gateway: \$GATEWAY"
echo "   Token:   \${TOKEN_PREFIX}… (hidden)"

echo "2/5 Preparing managed desktop app..."
APP_SOURCE="none"

if [[ -d "\$SOURCE_CODEX/Contents" ]]; then
  # Local Codex exists: never transfer ~1.3GB from host. Build managed app locally.
  echo "   Found local Codex.app — using local copy (no host transfer)"
  need ditto
  rm -rf "\$MANAGED_APP"
  ditto --noextattr --noqtn "\$SOURCE_CODEX" "\$MANAGED_APP"
  if [[ "\$(uname -s)" == "Darwin" ]]; then
    chmod -R u+rwX "\$MANAGED_APP" 2>/dev/null || true
    codesign --force --deep --sign - "\$MANAGED_APP" >/dev/null 2>&1 || true
  fi
  APP_SOURCE="local-codex"
elif [[ -d "\$MANAGED_APP/Contents" ]]; then
  # Managed app already present and no local Codex: keep it, do not re-download.
  echo "   Found existing managed Shimex.app — reusing (no host transfer)"
  APP_SOURCE="existing-managed"
else
  # Fallback: transfer managed app from host.
  echo "   No local Codex.app — transferring managed Shimex.app from host"
  need tar
  BUNDLE_INFO=\$(curl -fsSL -H "authorization: Bearer \$CLIENT_TOKEN" "\$GATEWAY/api/desktop/bundle")
  python3 -c 'import json,sys; info=json.load(sys.stdin); raise SystemExit(0 if info.get("available") else 2)' <<<"\$BUNDLE_INFO" || {
    echo "Host managed Shimex.app is missing." >&2
    echo "On host run: npm start  (or npm run shimex -- install --apply)" >&2
    exit 2
  }
  WORKDIR=\$(mktemp -d)
  ARCHIVE="\$WORKDIR/Shimex.app.tgz"
  curl -fL --progress-bar -H "authorization: Bearer \$CLIENT_TOKEN" \\
    "\$GATEWAY/api/desktop/shimex.app.tgz" -o "\$ARCHIVE"
  rm -rf "\$MANAGED_APP"
  tar -xzf "\$ARCHIVE" -C "\$(dirname "\$MANAGED_APP")"
  if [[ "\$(uname -s)" == "Darwin" ]]; then
    chmod -R u+rwX "\$MANAGED_APP" 2>/dev/null || true
    codesign --force --deep --sign - "\$MANAGED_APP" >/dev/null 2>&1 || true
  fi
  rm -rf "\$WORKDIR"
  APP_SOURCE="host-transfer"
fi

if [[ ! -d "\$MANAGED_APP/Contents" ]]; then
  echo "Managed app missing at \$MANAGED_APP" >&2
  exit 1
fi
echo "   App ready: \$MANAGED_APP (source=\$APP_SOURCE)"

echo "3/5 Writing client profile pointed at host..."
curl -fsSL -H "authorization: Bearer \$CLIENT_TOKEN" "\$GATEWAY/codex/model-catalog.json" -o "\$CATALOG_PATH"
DEFAULT_MODEL=\$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); models=data.get("models") or []; print((models[0] or {}).get("slug",""))' "\$CATALOG_PATH")
if [[ -z "\$DEFAULT_MODEL" ]]; then
  DEFAULT_MODEL=\$(curl -fsSL -H "authorization: Bearer \$CLIENT_TOKEN" "\$GATEWAY/v1/models" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(((data.get("data") or [{}])[0]).get("id",""))')
fi
if [[ -z "\$DEFAULT_MODEL" ]]; then
  echo "Host returned no models." >&2
  exit 1
fi

python3 - "\$CONFIG_PATH" "\$AUTH_PATH" "\$CATALOG_PATH" "\$GATEWAY" "\$CLIENT_TOKEN" "\$DEFAULT_MODEL" "\$PROFILE_HOME" <<'PY'
from pathlib import Path
import json, sys
config_path, auth_path, catalog_path, gateway, token, model, profile_home = sys.argv[1:8]
gateway = gateway.rstrip("/")
config = f'''# Generated by Shimex client join setup.
model = "{model}"
model_provider = "shimex"
model_catalog_json = "{catalog_path}"
web_search = "cached"

[model_providers.shimex]
name = "Shimex"
base_url = "{gateway}/v1"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
request_max_retries = 3
stream_max_retries = 3
stream_idle_timeout_ms = 600000
'''
Path(config_path).write_text(config + "\\n")
Path(auth_path).write_text(json.dumps({
  "auth_mode": "apikey",
  "OPENAI_API_KEY": token,
  "tokens": None,
  "last_refresh": None,
}, indent=2) + "\\n")
print(f"   Profile: {profile_home}")
print(f"   Default model: {model}")
PY

echo "4/5 Opening managed Shimex app..."
if [[ "\$(uname -s)" == "Darwin" ]]; then
  CODEX_HOME="\$PROFILE_HOME" OPENAI_API_KEY="\$CLIENT_TOKEN" open -n -a "\$MANAGED_APP" --args "--user-data-dir=\$USER_DATA_DIR"
else
  echo "Managed app installed at \$MANAGED_APP (open it manually on this platform)."
fi

echo ""
echo "Done."
echo "This machine is paired to the host and has the managed desktop app."
echo "App source: \$APP_SOURCE"
echo "Gateway: \$GATEWAY/v1"
`;
  return script;
}

export function setupScriptResponse(url) {
  const token = String(url.searchParams.get("token") || "").trim();
  const gateway = String(url.searchParams.get("gateway") || "").trim().replace(/\/+$/, "");
  const clientId = String(url.searchParams.get("clientId") || "").trim();
  const code = String(url.searchParams.get("c") || url.searchParams.get("code") || "").trim();
  const hostOrigin = `${url.protocol}//${url.host}`.replace(/\/+$/, "");
  return {
    status: 200,
    body: buildJoinSetupScript({ gateway, token, clientId, code, hostOrigin }),
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "content-disposition": 'inline; filename="shimex-client-setup.sh"',
      "cache-control": "no-store",
    },
  };
}

function shellQuote(value) {
  return `'${String(value || "").replaceAll("'", `'\"'\"'`)}'`;
}
