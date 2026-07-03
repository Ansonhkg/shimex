function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function codeSlots(code) {
  const groups = String(code || "").split("-");
  if (groups.length === 1) {
    return escapeHtml(code);
  }
  const slots = groups.map((group, index) => {
    const letters = group.split("").map((letter) => `<span class="basic-device-code-slot">${escapeHtml(letter)}</span>`).join("");
    return `${letters}${index < groups.length - 1 ? '<span class="basic-device-code-separator">-</span>' : ""}`;
  });
  return slots.join("");
}

export function deviceLoginPage(login, options = {}) {
  const pending = login.status === "pending";
  const escapedCode = escapeHtml(login.userCode);
  const profileName = login.profile || "";
  const apiBase = options.apiBase || "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${pending ? '<meta http-equiv="refresh" content="4">' : ""}
<meta name="shimex-api-base" content="${escapeHtml(apiBase)}">
<meta name="shimex-device-id" content="${escapeHtml(login.id)}">
<meta name="shimex-profile" content="${escapeHtml(profileName)}">
<title>Connect Codex</title>
<style>
body { background: #07100c; color: #f5f0e4; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; }
main { display: grid; gap: 18px; margin: 0 auto; max-width: 760px; padding: 48px 20px; }
section { background: #141816; border: 1px solid #314239; border-radius: 24px; padding: 24px; }
a { color: #f2c76e; }
.basic-device-code-row { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0; }
.basic-device-code { align-items: center; background: #050806; border: 1px solid #314239; border-radius: 18px; color: #f5f0e4; cursor: copy; display: inline-flex; flex-wrap: nowrap; gap: 8px; max-width: 100%; overflow-x: auto; padding: 10px; user-select: all; }
.basic-device-code:focus-visible { outline: 3px solid #f2c76e; outline-offset: 3px; }
.basic-device-code-group { display: inline-flex; flex: 0 0 auto; gap: 6px; }
.basic-device-code-slot { align-items: center; background: #141816; border: 1px solid #3d5046; border-radius: 12px; color: #f2c76e; display: inline-flex; flex: 0 0 clamp(2.15rem, 6vw, 2.75rem); font-size: clamp(1.75rem, 5vw, 2.45rem); font-weight: 900; height: clamp(3rem, 8vw, 4rem); justify-content: center; line-height: 1; min-width: 0; }
.basic-device-code-separator { align-items: center; color: #6f806f; display: inline-flex; flex: 0 0 auto; font-size: clamp(1.75rem, 5vw, 2.45rem); font-weight: 900; height: clamp(3rem, 8vw, 4rem); line-height: 1; }
.basic-device-copy { background: #203228; border: 1px solid #3d5046; border-radius: 999px; color: #f5f0e4; cursor: pointer; font: inherit; font-weight: 800; padding: 10px 14px; }
.muted { color: #b6c3b8; }
.error { color: #ffb4a9; }
.button { background: #f2c76e; border-radius: 999px; color: #161005; display: inline-flex; font-weight: 850; padding: 12px 16px; text-decoration: none; border: 0; cursor: pointer; font-size: 14px; }
.button-row { display: flex; gap: 12px; flex-wrap: wrap; }
.hidden { display: none; }
textarea { width: 100%; background: #050806; color: #f5f0e4; border: 1px solid #314239; border-radius: 12px; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; min-height: 120px; }
input[type=text] { background: #050806; color: #f5f0e4; border: 1px solid #314239; border-radius: 8px; padding: 8px 12px; font: inherit; min-width: 220px; }
</style>
</head>
<body>
<main>
  <p><a href="/admin">Back to Shimex admin</a></p>
  <section>
    <h1>Connect OpenAI Codex</h1>
    ${profileName ? `<p class="muted">This device flow will save into the <strong>${escapeHtml(profileName)}</strong> profile.</p>` : ""}
    ${login.status === "complete" ? `
      <p id="save-status">Codex is connected. Saving credentials to your Codex auths file…</p>
      <p><a class="button" href="/admin">Return to dashboard</a></p>
      <script>
      (function () {
        var statusEl = document.getElementById("save-status");
        var apiBaseMeta = document.querySelector('meta[name="shimex-api-base"]');
        var deviceIdMeta = document.querySelector('meta[name="shimex-device-id"]');
        if (!apiBaseMeta || !deviceIdMeta) return;
        var base = apiBaseMeta.getAttribute("content") || "";
        var id = deviceIdMeta.getAttribute("content") || "";
        fetch(base + "/api/codex-auths/device/" + encodeURIComponent(id) + "/complete", { method: "POST" })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
          })
          .then(function (out) {
            if (statusEl) {
              statusEl.textContent = out.ok
                ? "Saved as " + (out.body.profileName || "profile") + ". Redirecting…"
                : "Save failed: " + (out.body.error || "unknown error") + ". You can return to the dashboard and retry.";
            }
            if (out.ok) window.setTimeout(function () { window.location.href = "/admin"; }, 1200);
          })
          .catch(function (error) {
            if (statusEl) statusEl.textContent = "Save failed: " + String(error && error.message || error) + ". You can return to the dashboard and retry.";
          });
      })();
      </script>
    ` : ""}
    ${login.status === "error" ? `
      <p class="error">${escapeHtml(login.error || "Codex login failed.")}</p>
      <p><a class="button" href="/admin">Return to dashboard</a></p>
    ` : ""}
    ${pending ? `
      <p>Open the OpenAI device login page and enter this code:</p>
      <div class="basic-device-code-row">
        <button class="basic-device-code" type="button" aria-label="Copy device code ${escapedCode}" title="Copy code">
          ${codeSlots(login.userCode)}
        </button>
        <button class="basic-device-copy" type="button" data-copy-code="${escapedCode}" aria-label="Copy device code">Copy code</button>
        <span class="muted" data-copy-status aria-live="polite"></span>
      </div>
      <p><a class="button" href="${escapeHtml(login.verificationUri)}" target="_blank" rel="noreferrer">Open OpenAI login</a></p>
      <p class="muted">This page refreshes while the server waits for OpenAI to finish the device-code login.${login.expiresAt ? ` Code expires ${escapeHtml(login.expiresAt)}.` : ""}</p>
      <form id="cancel-form" method="post" action="/admin/codex-auth/device" onsubmit="return false;" style="margin-top:14px;">
        <div class="button-row">
          <button type="button" class="button" id="complete-button">Save credentials when ready</button>
          <button type="button" class="button" id="cancel-button" style="background:#314239;color:#f5f0e4;">Cancel</button>
        </div>
        <p class="muted" id="status-line" style="margin-top:8px;">Waiting for OpenAI…</p>
      </form>
    ` : ""}
  </section>
</main>
<script>
(function () {
  var status = document.querySelector("[data-copy-status]");
  document.querySelectorAll("[data-copy-code]").forEach(function (el) {
    el.addEventListener("click", function () {
      var code = el.getAttribute("data-copy-code");
      var field = document.createElement('textarea');
      field.value = code;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.focus();
      field.select();
      try { document.execCommand('copy'); } catch (e) {}
      field.remove();
      if (status) {
        status.textContent = 'Copied';
        window.setTimeout(function () { status.textContent = ''; }, 1800);
      }
    });
  });
  var apiBase = document.querySelector('meta[name="shimex-api-base"]').getAttribute('content') || '';
  var deviceId = document.querySelector('meta[name="shimex-device-id"]').getAttribute('content') || '';
  var statusLine = document.getElementById('status-line');
  var completeBtn = document.getElementById('complete-button');
  var cancelBtn = document.getElementById('cancel-button');
  async function refresh() {
    try {
      var response = await fetch(apiBase + '/api/codex-auths/device/' + encodeURIComponent(deviceId));
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        if (statusLine) statusLine.textContent = 'Login not found. Returning to admin shortly.';
        if (result && result.error) {
          window.setTimeout(function () { window.location.href = '/admin'; }, 1500);
        }
        return;
      }
      var device = result && result.device;
      if (device && device.status === 'complete') {
        if (statusLine) statusLine.textContent = 'Connected. Saving credentials…';
        var commit = await fetch(apiBase + '/api/codex-auths/device/' + encodeURIComponent(deviceId) + '/complete', { method: 'POST' });
        var commitResult = await commit.json().catch(function () { return {}; });
        if (commit.ok) {
          if (statusLine) statusLine.textContent = 'Saved as ' + (commitResult.profileName || 'profile') + '. Redirecting…';
          window.setTimeout(function () { window.location.href = '/admin'; }, 1200);
        } else {
          if (statusLine) statusLine.textContent = 'Save failed: ' + (commitResult.error || commit.status);
        }
      } else if (device && device.status === 'error') {
        if (statusLine) statusLine.textContent = 'Login failed: ' + (device.error || 'unknown');
      } else {
        if (statusLine) statusLine.textContent = 'Waiting for OpenAI…';
      }
    } catch (error) {
      if (statusLine) statusLine.textContent = 'Polling failed: ' + String(error && error.message || error);
    }
  }
  if (completeBtn) completeBtn.addEventListener('click', refresh);
  if (cancelBtn) cancelBtn.addEventListener('click', async function () {
    await fetch(apiBase + '/api/codex-auths/device/' + encodeURIComponent(deviceId) + '/cancel', { method: 'DELETE' }).catch(function () {});
    window.location.href = '/admin';
  });
  // Drive the save proactively instead of relying on the 4s meta-refresh
  // page reload to land on the complete-state render. The meta-refresh is
  // kept as a fallback; this interval commits /complete as soon as the
  // device flow reports complete.
  var pollHandle = window.setInterval(refresh, 4000);
  window.addEventListener('beforeunload', function () { window.clearInterval(pollHandle); });
})();
</script>
</body>
</html>`;
}
