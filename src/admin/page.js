export function adminPage() {
  return [
    "<!doctype html><html lang=\"en\"><head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Shimex Control Plane</title>",
    "<style>", styles(), "</style>",
    "</head><body>",
    header(),
    main(),
    toaster(),
    "<script>", runtime(), "</script>",
    "</body></html>",
  ].join("\n");
}

function styles() {
  return `
    :root {
      color-scheme: dark light;
      --bg: #0b0d12;
      --panel: #11151c;
      --panel-2: #161b25;
      --border: #1f2533;
      --border-strong: #2a3142;
      --text: #e6e9ef;
      --muted: #8a93a6;
      --accent: #6aa6ff;
      --accent-2: #4f8be8;
      --ok: #2fbf71;
      --warn: #e2b341;
      --danger: #e5484d;
      --shadow: 0 4px 24px rgba(0,0,0,0.35);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f6f9;
        --panel: #ffffff;
        --panel-2: #fafbfd;
        --border: #e3e6ee;
        --border-strong: #c8cdd9;
        --text: #14171f;
        --muted: #5a6273;
        --shadow: 0 4px 18px rgba(20,23,31,0.08);
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
    body { min-height: 100vh; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    code { background: var(--panel-2); padding: 1px 6px; border-radius: 4px; font-size: 0.85em; }

    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 14px 28px;
      background: var(--panel); border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand .mark {
      width: 28px; height: 28px; border-radius: 7px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px;
      box-shadow: var(--shadow);
    }
    .brand .name { font-weight: 600; letter-spacing: 0.2px; }
    .brand .sub { color: var(--muted); font-size: 13px; }
    .topbar nav { display: flex; gap: 6px; align-items: center; }
    .topbar nav a {
      color: var(--muted); padding: 6px 10px; border-radius: 6px;
    }
    .topbar nav a:hover { background: var(--panel-2); color: var(--text); text-decoration: none; }
    .status { display: flex; align-items: center; gap: 8px; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
      background: var(--panel-2); border: 1px solid var(--border-strong); color: var(--muted);
    }
    .pill.ok { color: var(--ok); border-color: rgba(47,191,113,0.35); }
    .pill.warn { color: var(--warn); border-color: rgba(226,179,65,0.35); }
    .pill.danger { color: var(--danger); border-color: rgba(229,72,77,0.35); }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: currentColor; box-shadow: 0 0 8px currentColor; }

    .wrap { max-width: 1180px; margin: 0 auto; padding: 28px; }
    .hero { margin-bottom: 28px; }
    .hero h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
    .hero p { margin: 0; color: var(--muted); font-size: 14px; }

    .grid {
      display: grid; gap: 18px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .card {
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 10px; padding: 18px; box-shadow: var(--shadow);
      min-width: 0;
    }
    .span-4 { grid-column: span 4; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .card .head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 10px; margin-bottom: 12px;
    }
    .card h2 { font-size: 14px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
    .card .meta { font-size: 12px; color: var(--muted); }

    .doctor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .doctor-grid .item {
      background: var(--panel-2); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px;
    }
    .doctor-grid .item .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .doctor-grid .item .val { font-size: 13px; margin-top: 4px; word-break: break-all; }
    .doctor-grid .item .val small { color: var(--muted); display: block; margin-top: 2px; }

    .actions { display: flex; flex-direction: column; gap: 10px; }
    .action {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px 16px; background: var(--panel-2); border: 1px solid var(--border);
      border-radius: 8px; flex-wrap: wrap;
    }
    .action .copy { flex: 1 1 220px; min-width: 0; }
    .action .copy .t { font-size: 13px; font-weight: 500; }
    .action .copy .d { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.45; }
    .button-row { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
    button {
      font-family: inherit; font-size: 13px; font-weight: 500;
      padding: 7px 14px; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-strong);
      background: var(--panel-2); color: var(--text); transition: all 0.15s ease;
    }
    button:hover { background: var(--panel); border-color: var(--accent); }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.primary:hover { background: var(--accent-2); border-color: var(--accent-2); }
    button.danger { color: var(--danger); border-color: rgba(229,72,77,0.5); }
    button.danger:hover { background: rgba(229,72,77,0.12); border-color: var(--danger); }
    button.ghost { background: transparent; border-color: var(--border-strong); }

    .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .toolbar input, .toolbar select {
      font-family: inherit; font-size: 13px; color: var(--text);
      background: var(--panel-2); border: 1px solid var(--border-strong); border-radius: 6px;
      padding: 7px 10px; min-width: 0;
    }
    .toolbar input { flex: 1; min-width: 180px; }
    .toolbar input:focus, .toolbar select:focus { outline: 1px solid var(--accent); border-color: var(--accent); }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      text-align: left; font-weight: 500; color: var(--muted);
      padding: 8px 10px; border-bottom: 1px solid var(--border-strong);
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
      background: var(--panel-2);
    }
    tbody td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: var(--panel-2); }
    td .slug { font-weight: 500; }
    td .upstream { color: var(--muted); font-size: 12px; display: block; margin-top: 2px; }

    .badge {
      display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px;
      background: var(--panel-2); border: 1px solid var(--border-strong); color: var(--muted);
    }
    .badge.image { color: #b48cff; border-color: rgba(180,140,255,0.35); }
    .badge.text { color: var(--muted); }
    .badge.provider { color: var(--accent); border-color: rgba(106,166,255,0.35); }

    .empty { color: var(--muted); font-size: 13px; padding: 24px; text-align: center; }
    .skeleton { background: linear-gradient(90deg, var(--panel-2) 25%, var(--panel) 50%, var(--panel-2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; height: 16px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .endpoints { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
    .endpoints a { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--panel-2); border-radius: 6px; border: 1px solid var(--border); }
    .endpoints a code { background: transparent; padding: 0; }

    #toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 50; pointer-events: none; }
    .toast {
      pointer-events: auto; min-width: 280px; max-width: 380px;
      background: var(--panel); border: 1px solid var(--border-strong); border-left: 3px solid var(--accent);
      border-radius: 8px; padding: 12px 14px; box-shadow: var(--shadow);
      animation: slide-in 0.2s ease;
    }
    .toast.ok { border-left-color: var(--ok); }
    .toast.warn { border-left-color: var(--warn); }
    .toast.err { border-left-color: var(--danger); }
    .toast .t { font-weight: 600; font-size: 13px; }
    .toast .d { font-size: 12px; color: var(--muted); margin-top: 2px; word-break: break-word; }
    @keyframes slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    @media (max-width: 900px) {
      .span-4, .span-8 { grid-column: span 6; }
    }
    @media (max-width: 640px) {
      .span-4, .span-8, .span-12 { grid-column: span 12; }
      .doctor-grid { grid-template-columns: 1fr; }
      .endpoints { grid-template-columns: 1fr; }
      .wrap { padding: 16px; }
      .topbar { padding: 12px 16px; }
    }
  `;
}

function header() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="mark">S</div>
        <div>
          <div class="name">Shimex</div>
          <div class="sub">Local provider gateway for managed Codex Desktop</div>
        </div>
      </div>
      <nav>
        <a href="/admin">Overview</a>
        <a href="/v1/models" target="_blank" rel="noreferrer">/v1/models</a>
        <a href="/health" target="_blank" rel="noreferrer">/health</a>
      </nav>
      <div class="status">
        <span id="health-pill" class="pill"><span class="dot"></span><span id="health-label">connecting…</span></span>
      </div>
    </header>
  `;
}

function main() {
  return `
    <div class="wrap">
      <section class="hero">
        <h1>Control plane</h1>
        <p>Inspect the managed Codex app, preview or apply setup changes, and review what Shimex exposes to Codex.</p>
      </section>
      <section class="grid">
        <div class="card span-4">
          <div class="head">
            <h2>Doctor</h2>
            <span id="doctor-meta" class="meta">checking…</span>
          </div>
          <div id="doctor" class="doctor-grid">
            <div class="skeleton" style="grid-column: span 2;"></div>
          </div>
        </div>
        <div class="card span-8">
          <div class="head">
            <h2>Managed Codex app</h2>
            <span class="meta">preview before you apply</span>
          </div>
          <div class="actions" id="actions"></div>
          <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
            <h2 style="margin-bottom:8px;">Endpoints</h2>
            <div class="endpoints">
              <a href="/health" target="_blank" rel="noreferrer"><code>GET /health</code><span>liveness</span></a>
              <a href="/v1/models" target="_blank" rel="noreferrer"><code>GET /v1/models</code><span>OpenAI list</span></a>
              <a href="/api/models" target="_blank" rel="noreferrer"><code>GET /api/models</code><span>Shimex catalog</span></a>
              <a href="/codex/model-catalog.json" target="_blank" rel="noreferrer"><code>GET /codex/model-catalog.json</code><span>Codex picker</span></a>
            </div>
          </div>
        </div>
        <div class="card span-12">
          <div class="head">
            <h2>Discovered models</h2>
            <span class="meta"><span id="model-count">0</span> visible</span>
          </div>
          <div class="toolbar">
            <input id="search" type="search" placeholder="Filter by slug, name, upstream, or provider…" autocomplete="off" />
            <select id="provider-filter" aria-label="Filter by provider"><option value="">All providers</option></select>
            <select id="modality-filter" aria-label="Filter by input modality">
              <option value="">All modalities</option>
              <option value="text">Text only</option>
              <option value="image">Vision-capable</option>
            </select>
            <button class="ghost" id="refresh" type="button">Refresh</button>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Provider</th>
                  <th>Upstream model</th>
                  <th>Input</th>
                  <th>Context</th>
                  <th>Reasoning</th>
                </tr>
              </thead>
              <tbody id="models"><tr><td colspan="6"><div class="skeleton" style="width:60%"></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;
}

function toaster() {
  return `<div id="toasts" aria-live="polite" aria-atomic="true"></div>`;
}

function runtime() {
  return `
    const els = {
      healthPill: document.getElementById("health-pill"),
      healthLabel: document.getElementById("health-label"),
      doctorMeta: document.getElementById("doctor-meta"),
      doctor: document.getElementById("doctor"),
      actions: document.getElementById("actions"),
      models: document.getElementById("models"),
      modelCount: document.getElementById("model-count"),
      search: document.getElementById("search"),
      providerFilter: document.getElementById("provider-filter"),
      modalityFilter: document.getElementById("modality-filter"),
      refresh: document.getElementById("refresh"),
      toasts: document.getElementById("toasts"),
    };
    const state = { models: [], doctor: null, health: null, busy: false };

    function toast(title, detail, kind) {
      const node = document.createElement("div");
      node.className = "toast " + (kind || "");
      node.innerHTML = '<div class="t"></div><div class="d"></div>';
      node.querySelector(".t").textContent = title;
      node.querySelector(".d").textContent = detail || "";
      els.toasts.appendChild(node);
      setTimeout(() => { node.style.opacity = "0"; node.style.transition = "opacity 0.2s"; setTimeout(() => node.remove(), 200); }, 4500);
    }

    function setHealth(ok, label) {
      els.healthPill.classList.remove("ok", "warn", "danger");
      els.healthPill.classList.add(ok ? "ok" : "danger");
      els.healthLabel.textContent = label;
    }

    function fmtContext(n) {
      const value = Number(n);
      if (!Number.isFinite(value) || value <= 0) return "—";
      if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + "M";
      if (value >= 1000) return (value / 1000).toFixed(0) + "K";
      return String(value);
    }
    function fmtPath(path) {
      if (!path) return "—";
      const home = (typeof window !== "undefined" && window.SHIMEX_HOME) || "~";
      return String(path).startsWith(home) ? String(path).replace(home, "~") : String(path);
    }
    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function renderDoctor(doctor) {
      state.doctor = doctor || {};
      els.doctorMeta.textContent = doctor && doctor.ok ? "ready" : "source Codex app missing";
      els.doctorMeta.style.color = doctor && doctor.ok ? "var(--ok)" : "var(--warn)";
      const items = [
        { label: "Source Codex app", val: fmtPath(state.doctor.sourceCodexApp?.path), sub: state.doctor.sourceCodexApp?.exists ? "detected" : "not found" },
        { label: "Managed Shimex app", val: fmtPath(state.doctor.managedShimexApp?.path), sub: state.doctor.managedShimexApp?.exists ? "installed" : "needs setup" },
        { label: "Profile home", val: fmtPath(state.doctor.profileHome) },
        { label: "User data dir", val: fmtPath(state.doctor.userDataDir) },
      ];
      els.doctor.innerHTML = items.map((item) => (
        '<div class="item">' +
          '<div class="label">' + escapeHtml(item.label) + '</div>' +
          '<div class="val"><code>' + escapeHtml(item.val) + '</code>' +
          (item.sub ? '<small>' + escapeHtml(item.sub) + '</small>' : '') +
          '</div>' +
        '</div>'
      )).join("");
    }

    function renderActions() {
      const managedExists = !!(state.doctor && state.doctor.managedShimexApp && state.doctor.managedShimexApp.exists);
      const items = [
        { id: "preview-install", endpoint: "/api/install", apply: false, label: "Preview setup", primary: !managedExists },
        { id: "apply-install", endpoint: "/api/install", apply: true, label: managedExists ? "Replace app" : "Set up app", primary: !managedExists },
        { id: "preview-sync", endpoint: "/api/sync", apply: false, label: "Preview update" },
        { id: "apply-sync", endpoint: "/api/sync", apply: true, label: "Update app", primary: managedExists },
        { id: "open", endpoint: "/api/open", apply: null, label: "Open Shimex", primary: managedExists },
      ];
      els.actions.innerHTML = items.map((item) => (
        '<div class="action">' +
          '<div class="copy"><div class="t">' + escapeHtml(item.label) + '</div>' +
          '<div class="d">' + escapeHtml(actionDescription(item)) + '</div></div>' +
          '<div class="button-row"><button data-id="' + escapeHtml(item.id) + '"' +
          (item.primary ? ' class="primary"' : '') + '>' + escapeHtml(item.label) + '</button></div>' +
        '</div>'
      )).join("");
      for (const button of els.actions.querySelectorAll("button[data-id]")) {
        button.addEventListener("click", () => runAction(items.find((it) => it.id === button.getAttribute("data-id"))));
      }
    }

    function actionDescription(item) {
      if (item.id === "preview-install") return "Show what Shimex would create. No files are changed.";
      if (item.id === "apply-install") return "Create or replace the managed Shimex app and Codex profile.";
      if (item.id === "preview-sync") return "Show what would be refreshed from Codex and the provider model list.";
      if (item.id === "apply-sync") return "Refresh the managed Shimex app, profile, and model catalog.";
      if (item.id === "open") return "Set up or update the managed app if needed and launch Shimex.";
      return "";
    }

    async function runAction(item) {
      if (state.busy) { toast("Busy", "Another action is running.", "warn"); return; }
      state.busy = true;
      const url = item.apply == null ? item.endpoint : (item.endpoint + (item.apply ? "?apply=1" : ""));
      const label = item.label;
      for (const button of els.actions.querySelectorAll("button")) { button.disabled = true; }
      try {
        const result = await fetch(url, { method: "POST", headers: { "accept": "application/json" } }).then(parseJson);
        if (result && result.error) {
          toast(label + " failed", String(result.error), "err");
        } else {
          toast(label, summarize(result), "ok");
        }
        await load();
      } catch (error) {
        toast(label + " failed", String(error && error.message || error), "err");
      } finally {
        state.busy = false;
        for (const button of els.actions.querySelectorAll("button")) { button.disabled = false; }
      }
    }

    function summarize(result) {
      if (!result || typeof result !== "object") return "done";
      if (result.applied) return "Applied.";
      if (result.started) return "Shimex opened.";
      if (result.stopping) return "Server stopping.";
      if (result.plan) return "Plan ready. Use Apply to commit.";
      return "done";
    }

    function renderModels() {
      const filterText = els.search.value.trim().toLowerCase();
      const provider = els.providerFilter.value;
      const modality = els.modalityFilter.value;
      const providers = new Set(state.models.map((m) => m.providerId));
      const current = els.providerFilter.value;
      els.providerFilter.innerHTML = '<option value="">All providers</option>' +
        Array.from(providers).sort().map((p) => '<option value="' + escapeHtml(p) + '"' + (p === current ? ' selected' : '') + '>' + escapeHtml(p) + '</option>').join("");

      const filtered = state.models.filter((model) => {
        if (provider && model.providerId !== provider) return false;
        if (modality === "image" && !(model.inputModalities || []).includes("image")) return false;
        if (modality === "text" && (model.inputModalities || []).includes("image")) return false;
        if (!filterText) return true;
        const haystack = [model.slug, model.displayName, model.upstreamModel, model.providerId, model.providerDisplayName]
          .filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(filterText);
      });

      els.modelCount.textContent = String(filtered.length);
      if (!filtered.length) {
        els.models.innerHTML = '<tr><td colspan="6"><div class="empty">No models match the current filters.</div></td></tr>';
        return;
      }
      els.models.innerHTML = filtered.map((model) => {
        const modalities = (model.inputModalities || ["text"]).map((m) => '<span class="badge ' + escapeHtml(m) + '">' + escapeHtml(m) + '</span>').join(" ");
        return '<tr>' +
          '<td><div class="slug"><code>' + escapeHtml(model.slug) + '</code></div>' +
          '<small style="color:var(--muted)">' + escapeHtml(model.displayName || "") + '</small></td>' +
          '<td><span class="badge provider">' + escapeHtml(model.providerDisplayName || model.providerId) + '</span></td>' +
          '<td class="upstream"><code>' + escapeHtml(model.upstreamModel || "—") + '</code></td>' +
          '<td>' + modalities + '</td>' +
          '<td>' + escapeHtml(fmtContext(model.contextWindow)) + '</td>' +
          '<td>' + escapeHtml(model.reasoningLevel || "—") + '</td>' +
        '</tr>';
      }).join("");
    }

    async function parseJson(response) {
      const text = await response.text();
      if (!text) return {};
      try { return JSON.parse(text); } catch { return { error: "Invalid JSON response", raw: text.slice(0, 200) }; }
    }

    async function load() {
      try {
        const [health, status] = await Promise.all([
          fetch("/health").then(parseJson),
          fetch("/api/status").then(parseJson),
        ]);
        state.health = health;
        const isOk = health && health.ok !== false && status && status.doctor && status.doctor.ok;
        setHealth(Boolean(isOk), isOk ? "online" : "needs setup");
        renderDoctor(status && status.doctor);
        state.models = (status && status.models) || [];
        renderActions();
        renderModels();
      } catch (error) {
        setHealth(false, "offline");
        els.doctorMeta.textContent = "unreachable";
        els.doctorMeta.style.color = "var(--danger)";
        els.models.innerHTML = '<tr><td colspan="6"><div class="empty">Could not reach the Shimex backend: ' + escapeHtml(String(error && error.message || error)) + '</div></td></tr>';
      }
    }

    els.search.addEventListener("input", renderModels);
    els.providerFilter.addEventListener("change", renderModels);
    els.modalityFilter.addEventListener("change", renderModels);
    els.refresh.addEventListener("click", () => load().then(() => toast("Refreshed", "Doctor and model list updated.", "ok")));
    load();
  `;
}
