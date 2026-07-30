export function joinPage({ advertiseUrl = "", code = "", error = "" } = {}) {
  const safeCode = escapeHtml(code);
  const safeHost = escapeHtml(advertiseUrl);
  const safeError = escapeHtml(error);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Join Shimex host</title>
  <style>
    :root {
      color-scheme: dark light;
      --bg: #0b0d12;
      --panel: #11151c;
      --text: #e6e9ef;
      --muted: #8a93a6;
      --accent: #6aa6ff;
      --ok: #2fbf71;
      --danger: #e5484d;
      --border: #1f2533;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f6f9;
        --panel: #fff;
        --text: #14171f;
        --muted: #5a6273;
        --border: #e3e6ee;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); display: grid; place-items: center; padding: 24px; }
    .card { width: min(560px, 100%); background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 12px; color: var(--muted); line-height: 1.45; }
    .status { margin: 18px 0; padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
    .status.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
    .status.err { background: color-mix(in srgb, var(--danger) 12%, transparent); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { white-space: pre-wrap; word-break: break-word; background: color-mix(in srgb, var(--bg) 80%, transparent); padding: 12px; border-radius: 10px; border: 1px solid var(--border); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    a.button, button {
      appearance: none; border: 1px solid var(--border); background: var(--accent); color: #fff;
      border-radius: 10px; padding: 10px 14px; font-weight: 600; text-decoration: none; cursor: pointer;
    }
    a.button.secondary, button.secondary { background: transparent; color: var(--text); }
    .muted { color: var(--muted); font-size: 13px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Join this Shimex host</h1>
    <p>Run one command on this machine to pair, install Shimex if needed, and open the managed app.</p>
    <p class="muted">Host: <code id="host">${safeHost || "(this host)"}</code></p>
    <div id="status" class="status">${safeError ? ("Error: " + safeError) : "Preparing secure setup…"}</div>
    <div id="success" class="hidden">
      <p><strong>Paired.</strong> Finish with this single command:</p>
      <pre id="oneliner"></pre>
      <div class="actions">
        <button class="button" id="copy" type="button">Copy command</button>
        <a class="button secondary" id="download" href="#">Download script</a>
      </div>
      <p class="muted" style="margin-top:14px;">It installs Shimex if needed, saves the client session, and opens the managed app.</p>
    </div>
    <div id="manual" class="hidden">
      <p class="muted">Manual fallback:</p>
      <pre id="manual-cmd"></pre>
    </div>
  </div>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var code = params.get("c") || params.get("code") || ${JSON.stringify(code || "")};
      var statusEl = document.getElementById("status");
      var successEl = document.getElementById("success");
      var manualEl = document.getElementById("manual");
      var onelinerEl = document.getElementById("oneliner");
      var manualCmdEl = document.getElementById("manual-cmd");
      var downloadEl = document.getElementById("download");
      var copyEl = document.getElementById("copy");
      var hostEl = document.getElementById("host");

      function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = "status" + (kind ? (" " + kind) : "");
      }

      if (!code) {
        setStatus("Missing pairing code in this link.", "err");
        return;
      }

      var setupPath = "/join/setup.sh?c=" + encodeURIComponent(code);
      var oneliner = "curl -fsSL '" + window.location.origin + setupPath + "' | bash";
      onelinerEl.textContent = oneliner;
      downloadEl.href = setupPath;
      manualCmdEl.textContent = "npm run shimex -- pair --from-url '" + window.location.href + "'\\n" +
        "npm run shimex -- client setup --open";

      fetch("/api/pair", {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({
          displayCode: code + "@" + window.location.host,
          clientLabel: navigator.platform || "browser-client",
        }),
      }).then(async function (response) {
        var payload = {};
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok) {
          setStatus((payload && (payload.error || payload.message)) || ("Pairing failed (HTTP " + response.status + ")"), "err");
          manualEl.classList.remove("hidden");
          return;
        }
        if (payload.gatewayUrl && hostEl) hostEl.textContent = payload.gatewayUrl;
        // Code is one-time; setup.sh needs a token-based bootstrap after browser redeem.
        // Prefer token bootstrap endpoint if present.
        if (payload.clientToken && payload.gatewayUrl) {
          var tokenSetup = "/join/setup.sh?token=" + encodeURIComponent(payload.clientToken) +
            "&gateway=" + encodeURIComponent(payload.gatewayUrl) +
            "&clientId=" + encodeURIComponent(payload.clientId || "");
          downloadEl.href = tokenSetup;
          oneliner = "curl -fsSL '" + window.location.origin + tokenSetup + "' | bash";
          onelinerEl.textContent = oneliner;
        }
        setStatus("Paired with host. Download/run the setup script to finish client setup.", "ok");
        successEl.classList.remove("hidden");
        manualEl.classList.remove("hidden");
      }).catch(function (error) {
        setStatus(String(error && error.message || error), "err");
        manualEl.classList.remove("hidden");
      });

      copyEl.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(onelinerEl.textContent || "").then(function () {
            copyEl.textContent = "Copied";
          }).catch(function () {
            copyEl.textContent = "Copy failed";
          });
        }
      });
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
