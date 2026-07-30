import { codexAuthsCard, codexAuthsRuntimeHelpers } from "./codexAuthsCard.js";
import { clineAuthsCard, clineAuthsRuntimeHelpers } from "./clineAuthsCard.js";
import { pairingCard, pairingRuntimeHelpers } from "./pairingCard.js";

export function adminPage() {
  return [
    "<!doctype html><html lang=\"en\"><head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Shimex Control Plane</title>",
    "<style>", styles(), "</style>",
    "</head><body>",
    shell(),
    toaster(),
    "<script>", runtime(), "</script>",
    "</body></html>",
  ].join("\n");
}

function styles() {
  return `
    :root {
      color-scheme: dark light;
      --bg: #050505;
      --bg-elevated: #0a0a0a;
      --panel: #0f0f0f;
      --panel-2: #141414;
      --panel-hover: #171717;
      --border: #1a1a1a;
      --border-strong: #262626;
      --text: #ededed;
      --muted: #888888;
      --accent: #0070f3;
      --accent-2: #0761d1;
      --accent-soft: rgba(0, 112, 243, 0.12);
      --ok: #0cce6b;
      --warn: #f5a623;
      --danger: #e5484d;
      --shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 8px 30px rgba(0,0,0,0.45);
      --sidebar-w: 64px;
      --radius: 12px;
      --radius-sm: 8px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #fafafa;
        --bg-elevated: #ffffff;
        --panel: #ffffff;
        --panel-2: #f7f7f7;
        --panel-hover: #f2f2f2;
        --border: #ebebeb;
        --border-strong: #e0e0e0;
        --text: #171717;
        --muted: #666666;
        --accent-soft: rgba(0, 112, 243, 0.08);
        --shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
    body { min-height: 100vh; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    code { background: var(--panel-2); padding: 1px 6px; border-radius: 4px; font-size: 0.85em; }

    .shell {
      display: grid;
      grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
      min-height: 100vh;
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 14px 0;
      background: var(--bg-elevated);
      border-right: 1px solid var(--border);
      z-index: 20;
    }
    .sidebar-brand {
      width: 34px; height: 34px; border-radius: 10px;
      background: linear-gradient(135deg, #0070f3, #79ffe1);
      color: #04111f; font-weight: 800; font-size: 14px;
      display: grid; place-items: center;
      margin-bottom: 10px;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 8px 20px rgba(0,112,243,0.25);
      flex-shrink: 0;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
      width: 100%;
      padding: 0 10px;
    }
    .nav-item {
      width: 42px; height: 42px; border-radius: 12px;
      display: grid; place-items: center;
      color: var(--muted);
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none !important;
      position: relative;
    }
    .nav-item:hover {
      color: var(--text);
      background: var(--panel-2);
      border-color: var(--border);
    }
    .nav-item.active {
      color: var(--text);
      background: var(--panel);
      border-color: var(--border-strong);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
    }
    .nav-item.active::before {
      content: "";
      position: absolute;
      left: -10px;
      width: 3px;
      height: 18px;
      border-radius: 999px;
      background: var(--accent);
    }
    .nav-item svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .sidebar-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 0 10px 4px;
      width: 100%;
    }
    .sidebar-link {
      width: 42px; height: 42px; border-radius: 12px;
      display: grid; place-items: center;
      color: var(--muted);
      border: 1px solid transparent;
      transition: all 0.15s ease;
      text-decoration: none !important;
    }
    .sidebar-link:hover { color: var(--text); background: var(--panel-2); border-color: var(--border); }
    .sidebar-link svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background:
        radial-gradient(1200px 500px at 20% -10%, rgba(0,112,243,0.08), transparent 55%),
        radial-gradient(900px 400px at 90% 0%, rgba(121,255,225,0.04), transparent 50%),
        var(--bg);
    }

    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 18px 28px 8px;
      position: sticky; top: 0; z-index: 10;
      background: color-mix(in srgb, var(--bg) 82%, transparent);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid transparent;
    }
    .topbar.scrolled { border-bottom-color: var(--border); }
    .brand-block { min-width: 0; }
    .brand-block .eyebrow {
      font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--muted); margin-bottom: 4px;
    }
    .brand-block h1 {
      margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em;
    }
    .brand-block p {
      margin: 4px 0 0; color: var(--muted); font-size: 13px;
    }
    .topbar-actions {
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    .status { display: flex; align-items: center; gap: 8px; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 500;
      background: var(--panel); border: 1px solid var(--border-strong); color: var(--muted);
    }
    .pill.ok { color: var(--ok); border-color: rgba(12,206,107,0.35); background: rgba(12,206,107,0.08); }
    .pill.warn { color: var(--warn); border-color: rgba(245,166,35,0.35); background: rgba(245,166,35,0.08); }
    .pill.danger { color: var(--danger); border-color: rgba(229,72,77,0.35); background: rgba(229,72,77,0.08); }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: currentColor; box-shadow: 0 0 8px currentColor; }

    .content {
      flex: 1;
      padding: 12px 28px 36px;
      max-width: 1280px;
      width: 100%;
    }
    .panel { display: none; animation: fade-in 0.18s ease; }
    .panel.active { display: block; }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .grid {
      display: grid; gap: 16px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .card, .auth-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .card { padding: 18px; }
    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .card .head, .auth-panel .head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 10px; margin-bottom: 12px;
    }
    .card h2 {
      font-size: 13px; font-weight: 600; margin: 0;
      letter-spacing: 0.02em; color: var(--text);
    }
    .card .meta { font-size: 12px; color: var(--muted); }

    .doctor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .doctor-grid .item {
      background: var(--panel-2); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px;
    }
    .doctor-grid .item .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .doctor-grid .item .val { font-size: 13px; margin-top: 4px; word-break: break-all; }
    .doctor-grid .item .val small { color: var(--muted); display: block; margin-top: 2px; }

    .button-row { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
    button {
      font-family: inherit; font-size: 13px; font-weight: 500;
      padding: 7px 14px; border-radius: 8px; cursor: pointer; border: 1px solid var(--border-strong);
      background: var(--panel-2); color: var(--text); transition: all 0.15s ease;
    }
    button:hover { background: var(--panel-hover); border-color: color-mix(in srgb, var(--accent) 50%, var(--border-strong)); }
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
      background: var(--panel-2); border: 1px solid var(--border-strong); border-radius: 8px;
      padding: 8px 11px; min-width: 0;
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
    .badge.provider { color: var(--provider-color, var(--accent)); border-color: color-mix(in srgb, var(--provider-color, var(--accent)) 45%, transparent); background: color-mix(in srgb, var(--provider-color, var(--accent)) 12%, transparent); }
    .badge.ok { color: var(--ok); border-color: rgba(12,206,107,0.35); }
    .badge.danger { color: var(--danger); border-color: rgba(229,72,77,0.5); }

    .auth-panel {
      background: var(--panel);
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      padding: 0;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .auth-panel .head {
      align-items: center;
      border-bottom: 1px solid var(--border);
      margin: 0;
      padding: 16px 20px;
      background: color-mix(in srgb, var(--panel-2) 60%, var(--panel));
    }
    .auth-panel h2 {
      color: var(--text);
      font-size: 14px;
      letter-spacing: 0.04em;
      text-transform: none;
      font-weight: 600;
    }
    .auth-panel h2 .auth-count {
      color: var(--muted);
      font-weight: 400;
      margin-left: 6px;
    }
    .auth-panel .meta { font-size: 12px; }
    .auth-panel .meta code { font-size: 11px; }

    .auth-refresh {
      align-items: center; background: var(--panel-2); border: 1px solid var(--border-strong);
      border-radius: 7px; color: var(--muted); cursor: pointer; display: inline-flex; gap: 6px;
      font-size: 12px; font-weight: 600; padding: 5px 11px; transition: all 0.15s ease;
    }
    .auth-refresh:hover { border-color: var(--accent); color: var(--text); }
    .auth-refresh:disabled { cursor: progress; opacity: 0.7; }
    .auth-refresh .spin {
      width: 13px; height: 13px; border-radius: 50%;
      border: 2px solid var(--border-strong); border-top-color: var(--accent);
      animation: spin 0.7s linear infinite; display: none;
    }
    .auth-refresh:disabled .spin { display: inline-block; }
    .auth-refresh:not(:disabled) .spin { display: none; }

    .auth-signin {
      align-items: center;
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      padding: 16px 20px;
      background: var(--panel-2);
    }
    .auth-signin .copy { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
    .auth-signin .copy .icon {
      width: 28px; height: 28px; border-radius: 8px;
      display: grid; place-items: center;
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      color: var(--accent); font-size: 16px; font-weight: 700;
    }
    .auth-signin .t { color: var(--text); font-size: 14px; font-weight: 600; }
    .auth-signin .d { color: var(--muted); font-size: 12px; line-height: 1.45; max-width: 560px; margin-top: 3px; }
    .auth-signin .button-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .auth-signin input {
      background: var(--panel);
      border: 1px solid var(--border-strong);
      border-radius: 7px;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      min-width: 220px;
      padding: 8px 12px;
    }
    .auth-signin input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
    .auth-signin details.action { border: 0; background: none; padding: 0; }
    .auth-signin details.action > summary { cursor: pointer; user-select: none; color: var(--muted); font-size: 12px; width: fit-content; }
    .auth-signin details.action > summary:hover { color: var(--text); }
    .auth-signin details.action[open] > .paste-body {
      margin-top: 10px; display: grid; gap: 10px; width: 100%;
      padding: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    }
    .auth-signin details.action textarea {
      font-family: ui-monospace, monospace; font-size: 12px; padding: 10px;
      border-radius: 6px; border: 1px solid var(--border-strong);
      background: var(--panel-2); color: var(--text); resize: vertical;
    }

    .auth-profiles { display: flex; flex-direction: column; }
    .auth-profile {
      display: grid;
      grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(240px, 300px);
      gap: 0;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s ease;
    }
    .auth-profile:last-child { border-bottom: 0; }
    .auth-profile:hover { background: color-mix(in srgb, var(--panel-2) 50%, var(--panel)); }

    .auth-profile-identity { padding: 18px 20px; border-right: 1px solid var(--border); }
    .auth-profile-usage { padding: 18px 20px; border-right: 1px solid var(--border); }
    .auth-profile-side { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }

    .auth-status {
      align-items: center;
      display: inline-flex;
      gap: 7px;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ok) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent);
      color: var(--ok);
    }
    .auth-status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
    .auth-status.danger { background: color-mix(in srgb, var(--danger) 12%, transparent); border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
    .auth-status.text { background: color-mix(in srgb, var(--muted) 12%, transparent); border-color: color-mix(in srgb, var(--muted) 30%, transparent); color: var(--muted); }
    .auth-status.text::before { box-shadow: none; }

    .profile-name { color: var(--text); font-size: 15px; font-weight: 700; margin-top: 10px; word-break: break-word; }
    .profile-label { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .profile-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .profile-chip {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      padding: 2px 7px; border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--accent);
    }
    .profile-chip.readonly { border-color: color-mix(in srgb, var(--muted) 35%, transparent); background: color-mix(in srgb, var(--muted) 10%, transparent); color: var(--muted); }
    .profile-chip.default { border-color: color-mix(in srgb, #b36cff 40%, transparent); background: color-mix(in srgb, #b36cff 12%, transparent); color: #b36cff; }
    .profile-note { color: var(--accent); font-size: 11px; font-weight: 600; margin-top: 6px; }

    .usage-empty { color: var(--muted); font-size: 13px; }
    .usage-loading { color: var(--muted); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
    .usage-loading::after { content: ""; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border-strong); border-top-color: var(--accent); animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .usage-plan-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .usage-plan-badge {
      font-size: 11px; font-weight: 700; text-transform: capitalize;
      padding: 3px 9px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--usage-color, var(--accent)) 40%, transparent);
      background: color-mix(in srgb, var(--usage-color, var(--accent)) 12%, transparent);
      color: var(--usage-color, var(--accent));
    }
    .usage-credits-chip {
      font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
      border: 1px solid var(--border-strong); background: var(--panel-2); color: var(--muted);
    }

    .usage-reset-credits {
      margin-top: 12px; padding: 10px 12px; border-radius: 12px;
      border: 1px solid var(--border); background: color-mix(in srgb, var(--panel-2) 85%, transparent);
      color: var(--text); font-size: 11px; line-height: 1.45;
    }
    .usage-reset-credits.error { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 35%, transparent); }
    .usage-reset-credits-head { display: flex; flex-wrap: wrap; gap: 8px 14px; font-weight: 700; margin-bottom: 6px; }
    .usage-credit-expirations { display: grid; gap: 3px; color: var(--muted); }
    .usage-credit-expirations.muted { color: var(--muted); }
    .usage-credit-expiration { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    .usage-graph { display: flex; flex-direction: column; gap: 14px; }
    .usage-lane { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 14px; align-items: center; }
    .usage-ring { position: relative; width: 44px; height: 44px; }
    .usage-ring svg { width: 44px; height: 44px; transform: rotate(-90deg); }
    .usage-ring .ring-bg { fill: none; stroke: var(--border-strong); stroke-width: 4; }
    .usage-ring .ring-fill {
      fill: none; stroke: var(--usage-color, var(--accent)); stroke-width: 4; stroke-linecap: round;
      transition: stroke-dashoffset 0.6s ease;
    }
    .usage-ring .ring-pct {
      position: absolute; inset: 0; display: grid; place-items: center;
      font-size: 9px; font-weight: 700; color: var(--text);
    }
    .usage-lane-body { min-width: 0; }
    .usage-lane-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .usage-lane-label { font-size: 12px; font-weight: 600; color: var(--text); }
    .usage-lane-reset { font-size: 11px; color: var(--muted); white-space: nowrap; }
    .usage-track {
      margin-top: 6px; height: 6px; border-radius: 999px;
      background: var(--border); overflow: hidden; position: relative;
    }
    .usage-track-fill {
      height: 100%; border-radius: inherit;
      background: linear-gradient(90deg, var(--usage-color, var(--ok)), color-mix(in srgb, var(--usage-color, var(--ok)) 65%, white));
      transition: width 0.6s ease;
    }
    .usage-track-fill.danger { background: linear-gradient(90deg, var(--danger), color-mix(in srgb, var(--danger) 65%, white)); }
    .usage-track-fill.warn { background: linear-gradient(90deg, var(--warn), color-mix(in srgb, var(--warn) 65%, white)); }

    .token-row { display: flex; flex-direction: column; gap: 4px; }
    .token-pill {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px;
      background: color-mix(in srgb, var(--ok) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent);
      color: var(--ok); width: fit-content;
    }
    .token-pill.danger { background: color-mix(in srgb, var(--danger) 10%, transparent); border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
    .token-pill.unknown { background: var(--panel-2); border-color: var(--border-strong); color: var(--muted); }
    .token-detail { color: var(--muted); font-size: 11px; }
    .updated-row { color: var(--muted); font-size: 11px; }

    .auth-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
    .auth-actions button {
      font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 6px;
      border: 1px solid var(--border-strong); background: var(--panel-2); color: var(--text);
      cursor: pointer; transition: all 0.15s ease;
    }
    .auth-actions button:hover { border-color: var(--accent); background: var(--panel); }
    .auth-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
    .auth-actions button.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
    .auth-actions button.danger:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); border-color: var(--danger); }
    .auth-action-label { color: var(--muted); font-size: 12px; font-style: italic; }

    .auth-empty { color: var(--muted); font-size: 13px; padding: 32px 20px; text-align: center; }

    @media (max-width: 760px) {
      .auth-profile { grid-template-columns: 1fr; }
      .auth-profile-identity, .auth-profile-usage { border-right: 0; border-bottom: 1px solid var(--border); }
      .auth-signin { grid-template-columns: 1fr; }
    }

    .empty { color: var(--muted); font-size: 13px; padding: 24px; text-align: center; }
    .skeleton { background: linear-gradient(90deg, var(--panel-2) 25%, var(--panel) 50%, var(--panel-2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; height: 16px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .endpoints { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
    .pairing-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .pairing-panel { background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .pairing-panel h3 { margin: 0 0 6px; font-size: 14px; }
    .pairing-panel .muted, .muted { color: var(--muted); font-size: 12px; }
    .pairing-code-box { margin-top: 12px; padding: 12px; border-radius: 8px; background: var(--bg); border: 1px dashed var(--border-strong); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    .pairing-command { color: var(--text); line-height: 1.5; margin-bottom: 8px; overflow-wrap: anywhere; user-select: all; }
    .pairing-clients { display: grid; gap: 8px; margin-top: 8px; }
    .pairing-client-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
    .pairing-help { margin-top: 12px; color: var(--muted); font-size: 12px; }
    @media (max-width: 900px) { .pairing-grid { grid-template-columns: 1fr; } }
    .endpoints a {
      display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px;
      background: var(--panel-2); border-radius: 8px; border: 1px solid var(--border);
      color: var(--text); text-decoration: none;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .endpoints a:hover { border-color: var(--border-strong); background: var(--panel-hover); text-decoration: none; }
    .endpoints a code { background: transparent; padding: 0; color: var(--accent); }
    .endpoints a span { color: var(--muted); }

    #toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 50; pointer-events: none; }
    .toast {
      pointer-events: auto; min-width: 280px; max-width: 380px;
      background: var(--panel); border: 1px solid var(--border-strong); border-left: 3px solid var(--accent);
      border-radius: 10px; padding: 12px 14px; box-shadow: var(--shadow);
      animation: slide-in 0.2s ease;
    }
    .toast.ok { border-left-color: var(--ok); }
    .toast.warn { border-left-color: var(--warn); }
    .toast.err { border-left-color: var(--danger); }
    .toast .t { font-weight: 600; font-size: 13px; }
    .toast .d { font-size: 12px; color: var(--muted); margin-top: 2px; word-break: break-word; }
    @keyframes slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    @media (max-width: 900px) {
      .span-4, .span-6, .span-8 { grid-column: span 12; }
    }
    @media (max-width: 720px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar {
        position: sticky; top: 0; height: auto; width: 100%;
        flex-direction: row; justify-content: space-between;
        padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--border);
      }
      .sidebar-brand { margin: 0; width: 30px; height: 30px; border-radius: 8px; }
      .sidebar-nav { flex-direction: row; width: auto; padding: 0; gap: 4px; flex: 0; }
      .sidebar-footer { width: auto; flex-direction: row; padding: 0; }
      .nav-item, .sidebar-link { width: 38px; height: 38px; border-radius: 10px; }
      .nav-item.active::before { display: none; }
      .topbar, .content { padding-left: 16px; padding-right: 16px; }
      .doctor-grid { grid-template-columns: 1fr; }
      .endpoints { grid-template-columns: 1fr; }
    }
  `;
}

function icon(name) {
  const icons = {
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>',
    models: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h10"></path><circle cx="18.5" cy="17" r="2"></circle></svg>',
    pairing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5 7 16a4 4 0 1 0 5.7 5.7l1.8-1.8"></path><path d="m15.5 9.5 1.5-1.5A4 4 0 1 0 11.3 2.3L9.5 4.1"></path><path d="m9 15 6-6"></path></svg>',
    codex: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 7v10L12 21l7.5-4V7L12 3z"></path><path d="M12 12 4.8 7.8"></path><path d="M12 12v9"></path><path d="m12 12 7.2-4.2"></path></svg>',
    cline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 1 6 6c0 2.2-1.2 3.8-2.5 5-.9.8-1.5 1.6-1.5 2.5v1h-4v-1c0-.9-.6-1.7-1.5-2.5C7.2 12.8 6 11.2 6 9a6 6 0 0 1 6-6z"></path><path d="M10 20h4"></path></svg>',
    modelsApi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"></path><path d="M10 14 21 3"></path><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"></path></svg>',
  };
  return icons[name] || "";
}

function shell() {
  return `
    <div class="shell">
      <aside class="sidebar" aria-label="Primary">
        <div class="sidebar-brand" title="Shimex">S</div>
        <nav class="sidebar-nav">
          <a class="nav-item active" href="#overview" data-view="overview" title="Overview" aria-label="Overview">${icon("overview")}</a>
          <a class="nav-item" href="#models" data-view="models" title="Models" aria-label="Models">${icon("models")}</a>
          <a class="nav-item" href="#pairing" data-view="pairing" title="Pairing" aria-label="Pairing">${icon("pairing")}</a>
          <a class="nav-item" href="#codex" data-view="codex" title="Codex profiles" aria-label="Codex profiles">${icon("codex")}</a>
          <a class="nav-item" href="#cline" data-view="cline" title="Cline profiles" aria-label="Cline profiles">${icon("cline")}</a>
        </nav>
        <div class="sidebar-footer">
          <a class="sidebar-link" href="/v1/models" target="_blank" rel="noreferrer" title="/v1/models" aria-label="Open /v1/models">${icon("modelsApi")}</a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar">
          <div class="brand-block">
            <div class="eyebrow">Shimex</div>
            <h1 id="view-title">Overview</h1>
            <p id="view-subtitle">Doctor status, endpoints, and gateway health.</p>
          </div>
          <div class="topbar-actions">
            <div class="status">
              <span id="health-pill" class="pill"><span class="dot"></span><span id="health-label">connecting…</span></span>
            </div>
          </div>
        </header>
        <div class="content">
          <section class="panel active" id="panel-overview" data-panel="overview">
            <div class="grid">
              <div class="card span-6">
                <div class="head">
                  <h2>Doctor</h2>
                  <span id="doctor-meta" class="meta">checking…</span>
                </div>
                <div id="doctor" class="doctor-grid">
                  <div class="skeleton" style="grid-column: span 2;"></div>
                </div>
              </div>
              <div class="card span-6">
                <div class="head">
                  <h2>Endpoints</h2>
                  <span class="meta">local OpenAI-compatible surface</span>
                </div>
                <div class="endpoints">
                  <a href="/health" target="_blank" rel="noreferrer"><code>GET /health</code><span>liveness</span></a>
                  <a href="/v1/models" target="_blank" rel="noreferrer"><code>GET /v1/models</code><span>OpenAI list</span></a>
                  <a href="/api/models" target="_blank" rel="noreferrer"><code>GET /api/models</code><span>Shimex catalog</span></a>
                  <a href="/codex/model-catalog.json" target="_blank" rel="noreferrer"><code>GET /codex/model-catalog.json</code><span>Codex picker</span></a>
                </div>
              </div>
            </div>
          </section>

          <section class="panel" id="panel-models" data-panel="models">
            <div class="grid">
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
            </div>
          </section>

          <section class="panel" id="panel-pairing" data-panel="pairing">
            <div class="grid">
              ${pairingCard()}
            </div>
          </section>

          <section class="panel" id="panel-codex" data-panel="codex">
            <div class="grid">
              ${codexAuthsCard()}
            </div>
          </section>

          <section class="panel" id="panel-cline" data-panel="cline">
            <div class="grid">
              ${clineAuthsCard()}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function toaster() {
  return `<div id="toasts" aria-live="polite" aria-atomic="true"></div>`;
}

function runtime() {
  return `
    const VIEW_META = {
      overview: { title: "Overview", subtitle: "Doctor status, endpoints, and gateway health." },
      models: { title: "Models", subtitle: "What Shimex currently exposes to Codex Desktop." },
      pairing: { title: "Pairing", subtitle: "Host mode, client commands, and paired machines." },
      codex: { title: "Codex profiles", subtitle: "Connected OpenAI Codex accounts and usage." },
      cline: { title: "Cline profiles", subtitle: "Connected Cline accounts and usage." },
    };

    const els = {
      healthPill: document.getElementById("health-pill"),
      healthLabel: document.getElementById("health-label"),
      doctorMeta: document.getElementById("doctor-meta"),
      doctor: document.getElementById("doctor"),
      models: document.getElementById("models"),
      modelCount: document.getElementById("model-count"),
      search: document.getElementById("search"),
      providerFilter: document.getElementById("provider-filter"),
      modalityFilter: document.getElementById("modality-filter"),
      refresh: document.getElementById("refresh"),
      toasts: document.getElementById("toasts"),
      topbar: document.getElementById("topbar"),
      viewTitle: document.getElementById("view-title"),
      viewSubtitle: document.getElementById("view-subtitle"),
    };
    const state = { models: [], doctor: null, health: null, view: "overview" };

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

    function normalizeView(raw) {
      const value = String(raw || "").replace(/^#/, "").trim().toLowerCase();
      if (!value || value === "overview" || value === "admin") return "overview";
      if (value === "pairing-card" || value === "pair" || value === "pair-client") return "pairing";
      if (value === "codex-auths" || value === "codex-auths-panel") return "codex";
      if (value === "cline-auths" || value === "cline-auths-panel") return "cline";
      if (VIEW_META[value]) return value;
      return "overview";
    }

    function setView(nextView, { updateHash = true } = {}) {
      const view = normalizeView(nextView);
      state.view = view;
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.getAttribute("data-view") === view);
      });
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.getAttribute("data-panel") === view);
      });
      const meta = VIEW_META[view] || VIEW_META.overview;
      els.viewTitle.textContent = meta.title;
      els.viewSubtitle.textContent = meta.subtitle;
      if (updateHash) {
        const hash = "#" + view;
        if (location.hash !== hash) history.replaceState(null, "", hash);
      }
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

    const PROVIDER_COLORS = {
      "cline-pass": "#9F57FA",
      "lm-studio": "#5326C9",
      "chatgpt-codex": "#049776",
      "local-router": "#EBAE42",
      "deepseek": "#4E6BFE",
      "cloudflare-workers-ai": "#FF500B",
      "grok": "#1DA1F2",
    };

    function providerColor(providerId) {
      const id = String(providerId || "");
      if (PROVIDER_COLORS[id]) return PROVIDER_COLORS[id];
      var hash = 0;
      for (var i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
      var hue = Math.abs(hash) % 360;
      return 'hsl(' + hue + ' 74% 58%)';
    }

    function providerBadgeStyle(providerId) {
      return '--provider-color:' + escapeHtml(providerColor(providerId));
    }

    function providerLabel(model) {
      return model.providerDisplayName || model.providerId || 'Provider';
    }

    function renderModels() {
      const filterText = els.search.value.trim().toLowerCase();
      const provider = els.providerFilter.value;
      const modality = els.modalityFilter.value;
      const providers = new Set(state.models.map((m) => m.providerId));
      const current = els.providerFilter.value;
      els.providerFilter.innerHTML = '<option value="">All providers</option>' +
        Array.from(providers).sort().map((p) => '<option value="' + escapeHtml(p) + '" style="color:' + escapeHtml(providerColor(p)) + '"' + (p === current ? ' selected' : '') + '>' + escapeHtml(p) + '</option>').join("");

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
          '<td><span class="badge provider" style="' + providerBadgeStyle(model.providerId) + '">' + escapeHtml(providerLabel(model)) + '</span></td>' +
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
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        setView(item.getAttribute("data-view"));
      });
    });
    window.addEventListener("hashchange", () => setView(location.hash, { updateHash: false }));
    window.addEventListener("scroll", () => {
      if (!els.topbar) return;
      els.topbar.classList.toggle("scrolled", window.scrollY > 4);
    }, { passive: true });

    ${codexAuthsRuntimeHelpers()}
    ${clineAuthsRuntimeHelpers()}
    ${pairingRuntimeHelpers()}
    els.refresh.addEventListener("click", () => load().then(() => toast("Refreshed", "Doctor and model list updated.", "ok")));
    setView(location.hash || "overview", { updateHash: !location.hash });
    initCodexAuths();
    initClineAuths();
    initPairing();
    load();
  `;
}
