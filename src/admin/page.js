import { codexAuthsCard, codexAuthsRuntimeHelpers } from "./codexAuthsCard.js";
import { clineAuthsCard, clineAuthsRuntimeHelpers } from "./clineAuthsCard.js";
import { grokAuthsCard, grokAuthsRuntimeHelpers } from "./grokAuthsCard.js";
import { cursorAuthsCard, cursorAuthsRuntimeHelpers } from "./cursorAuthsCard.js";
import { pairingCard, pairingRuntimeHelpers } from "./pairingCard.js";
import { providerConfigCard, providerConfigRuntimeHelpers } from "./providerConfigCard.js";
import { providerNavIcon } from "./providerIcons.js";

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
      --sidebar-w: 232px;
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

    /* Apple-style thin scrollbars (global) */
    * {
      scrollbar-width: thin; /* Firefox */
      scrollbar-color: color-mix(in srgb, var(--muted) 55%, transparent) transparent;
    }
    *::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    *::-webkit-scrollbar-track {
      background: transparent;
    }
    *::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--muted) 45%, transparent);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    *::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--muted) 70%, transparent);
      background-clip: content-box;
      border: 2px solid transparent;
    }
    *::-webkit-scrollbar-corner {
      background: transparent;
    }
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
      gap: 18px;
      padding: 18px 14px;
      background: var(--bg-elevated);
      border-right: 1px solid var(--border);
      z-index: 20;
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px 8px;
      flex-shrink: 0;
      text-decoration: none !important;
      color: var(--text);
    }
    .sidebar-brand:hover { text-decoration: none !important; }
    .sidebar-brand img {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: block;
      flex-shrink: 0;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.06);
    }
    .sidebar-brand .brand-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.15;
    }
    .sidebar-brand .brand-name {
      font-size: 14px;
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    .sidebar-brand .brand-tag {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }

    .nav-separator {
      width: 100%;
      padding: 12px 10px 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      opacity: 0.85;
      user-select: none;
    }
    .nav-separator::after {
      content: "";
      display: block;
      margin-top: 6px;
      height: 1px;
      background: var(--border);
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      width: 100%;
      min-height: 0;
    }
    .nav-item {
      width: 100%;
      min-height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 10px;
      color: var(--muted);
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none !important;
      position: relative;
      font-size: 13px;
      font-weight: 500;
    }
    .nav-item:hover {
      color: var(--text);
      background: var(--panel-2);
      border-color: var(--border);
      text-decoration: none !important;
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
      left: -14px;
      width: 3px;
      height: 18px;
      border-radius: 999px;
      background: var(--accent);
    }
    .nav-item .nav-icon {
      width: 18px;
      height: 18px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .nav-item svg,
    .sidebar-link svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .nav-item svg.provider-icon {
      stroke: none;
      fill: currentColor;
    }
    .nav-item .nav-label {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-footer {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .sidebar-link {
      width: 100%;
      min-height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 10px;
      color: var(--muted);
      border: 1px solid transparent;
      transition: all 0.15s ease;
      text-decoration: none !important;
      font-size: 13px;
      font-weight: 500;
    }
    .sidebar-link:hover {
      color: var(--text);
      background: var(--panel-2);
      border-color: var(--border);
      text-decoration: none !important;
    }
    .sidebar-link .nav-icon {
      width: 18px;
      height: 18px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--bg);
    }

    .topbar {
      position: sticky; top: 0; z-index: 10;
      width: 100%;
      background: color-mix(in srgb, var(--bg) 82%, transparent);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid transparent;
    }
    .topbar.scrolled { border-bottom-color: var(--border); }
    .topbar-inner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 18px 24px 8px;
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
    }
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
    .health-dot {
      display: block; width: 10px; height: 10px; border-radius: 999px;
      background: var(--muted); color: var(--muted); cursor: help;
      box-shadow: 0 0 8px currentColor;
    }
    .health-dot.ok { background: var(--ok); color: var(--ok); }
    .health-dot.warn { background: var(--warn); color: var(--warn); }
    .health-dot.danger { background: var(--danger); color: var(--danger); }

    .content {
      flex: 1;
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
      padding: 12px 24px 36px;
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
    /* Top-level page shells should provide layout, not another surface around their inner cards. */
    .grid > .card {
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
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

    /* Shared account/session pages: Codex, Cline, Grok */
    .auth-page { min-width: 0; }
    .auth-shell,
    .auth-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0;
      overflow: hidden;
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .auth-toolbar,
    .auth-panel .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin: 0;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel-2) 70%, var(--panel));
    }
    .auth-toolbar-copy { min-width: 0; flex: 1 1 auto; }
    .auth-kicker,
    .auth-panel h2 {
      margin: 0;
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .auth-count,
    .auth-panel h2 .auth-count {
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: none;
      margin-left: 6px;
    }
    .auth-meta,
    .auth-panel .meta {
      margin: 6px 0 0;
      font-size: 12px;
      line-height: 1.45;
      color: var(--muted);
    }
    .auth-meta code,
    .auth-panel .meta code { font-size: 11px; }

    .auth-refresh {
      align-items: center;
      background: var(--panel-2);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      gap: 6px;
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 600;
      padding: 7px 12px;
      transition: all 0.15s ease;
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px 20px;
      align-items: center;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel-2) 55%, transparent);
    }
    .auth-signin-copy,
    .auth-signin .copy {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      min-width: 0;
    }
    .auth-signin-icon,
    .auth-signin .copy .icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
      color: var(--accent);
      font-size: 15px;
      font-weight: 700;
    }
    .auth-signin-title,
    .auth-signin .t {
      color: var(--text);
      font-size: 14px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    .auth-signin-desc,
    .auth-signin .d {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      max-width: 620px;
      margin-top: 4px;
    }
    .auth-signin-controls,
    .auth-signin .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
    }
    .auth-signin-controls input,
    .auth-signin input,
    .auth-paste-body input,
    .auth-paste-body textarea {
      background: var(--panel);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      min-width: 220px;
      padding: 9px 12px;
    }
    .auth-signin-controls input:focus,
    .auth-signin input:focus,
    .auth-paste-body input:focus,
    .auth-paste-body textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
    }

    .auth-paste,
    .auth-signin details.action {
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel-2) 40%, transparent);
    }
    .auth-paste > summary,
    .auth-signin details.action > summary {
      cursor: pointer;
      user-select: none;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      padding: 12px 18px;
      list-style: none;
    }
    .auth-paste > summary::-webkit-details-marker { display: none; }
    .auth-paste > summary:hover,
    .auth-signin details.action > summary:hover { color: var(--text); }
    .auth-paste-body,
    .auth-signin details.action[open] > .paste-body {
      display: grid;
      gap: 10px;
      padding: 0 18px 16px;
    }
    .auth-paste-body textarea,
    .auth-signin details.action textarea {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      resize: vertical;
      min-height: 120px;
      background: var(--panel-2);
    }
    .auth-paste-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .auth-paste-note,
    .auth-paste-body small {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }

    .auth-profiles { display: flex; flex-direction: column; }
    .auth-profile {
      display: grid;
      grid-template-columns: minmax(160px, 200px) minmax(0, 1fr) minmax(180px, 220px);
      gap: 0;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s ease;
    }
    .auth-profile:last-child { border-bottom: 0; }
    .auth-profile:hover { background: color-mix(in srgb, var(--panel-2) 50%, var(--panel)); }

    .auth-profile-identity,
    .auth-profile-usage,
    .auth-profile-side {
      min-width: 0;
      padding: 18px;
    }
    .auth-profile-identity { border-right: 1px solid var(--border); }
    .auth-profile-usage {
      border-right: 1px solid var(--border);
      overflow: hidden;
    }
    .auth-profile-side {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--panel);
      position: relative;
      z-index: 1;
    }

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

    .usage-overview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .usage-overview-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-2);
      padding: 14px;
      min-height: 132px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .usage-overview-card .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .usage-overview-card .provider {
      font-size: 13px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    .usage-overview-card .state {
      font-size: 11px;
      color: var(--muted);
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      padding: 2px 8px;
      white-space: nowrap;
    }
    .usage-overview-card .state.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
    .usage-overview-card .state.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 35%, transparent); }
    .usage-overview-card .state.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
    .usage-overview-card .big {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .usage-overview-card .pct {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .usage-overview-card .pct-label {
      color: var(--muted);
      font-size: 12px;
    }
    .usage-overview-card .bars {
      display: grid;
      gap: 8px;
    }
    .usage-overview-bar {
      display: grid;
      gap: 4px;
    }
    .usage-overview-bar .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .usage-overview-bar .track {
      height: 6px;
      border-radius: 999px;
      background: var(--border);
      overflow: hidden;
    }
    .usage-overview-bar .fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--usage-color, var(--ok)), color-mix(in srgb, var(--usage-color, var(--ok)) 65%, white));
    }
    .usage-overview-card .muted {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .usage-overview-card a {
      color: var(--accent);
      font-size: 12px;
      text-decoration: none;
    }
    .usage-overview-card a:hover { text-decoration: underline; }
    @media (max-width: 900px) {
      .usage-overview { grid-template-columns: 1fr; }
    }

    .usage-graph { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .usage-lane {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      min-width: 0;
    }
    .usage-ring { position: relative; width: 44px; height: 44px; flex: 0 0 44px; }
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
    .usage-lane-body { min-width: 0; overflow: hidden; }
    .usage-lane-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 8px;
      min-width: 0;
    }
    .usage-lane-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      min-width: 0;
    }
    .usage-lane-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--usage-color, var(--text));
      white-space: nowrap;
    }
    .usage-lane-reset {
      flex: 1 1 100%;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.35;
      white-space: normal;
      overflow-wrap: anywhere;
    }
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

    @media (max-width: 1100px) {
      .auth-profile {
        grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
      }
      .auth-profile-side {
        grid-column: 1 / -1;
        border-right: 0;
        border-top: 1px solid var(--border);
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
      }
      .auth-profile-side .token-row { flex: 0 1 auto; }
      .auth-profile-side .updated-row { flex: 1 1 auto; min-width: 120px; }
      .auth-profile-side .auth-actions { margin-top: 0; margin-left: auto; }
    }

    @media (max-width: 760px) {
      .auth-profile { grid-template-columns: 1fr; }
      .auth-profile-identity,
      .auth-profile-usage {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }
      .auth-profile-side {
        flex-direction: column;
        align-items: stretch;
      }
      .auth-profile-side .auth-actions { margin-left: 0; }
      .auth-signin {
        grid-template-columns: 1fr;
      }
      .auth-signin-controls,
      .auth-signin .button-row {
        justify-content: stretch;
      }
      .auth-signin-controls input,
      .auth-signin input {
        min-width: 0;
        flex: 1 1 auto;
      }
    }



    .config-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .config-tab {
      border: 1px solid var(--border-strong);
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .config-tab.active {
      color: var(--text);
      border-color: color-mix(in srgb, var(--accent) 45%, var(--border-strong));
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .config-pane { display: none; }
    .config-pane.active { display: block; }

    .env-plane {
      display: grid;
      gap: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--panel);
    }
    .env-plane-head {
      display: grid;
      grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: color-mix(in srgb, var(--panel-2) 70%, transparent);
    }
    .env-rows { display: grid; }
    .env-row {
      display: grid;
      grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }
    .env-row:last-child { border-bottom: 0; }
    .env-row:hover { background: color-mix(in srgb, var(--panel-2) 55%, var(--panel)); }
    .env-row input {
      width: 100%;
      min-width: 0;
      font: inherit;
      font-size: 13px;
      color: var(--text);
      background: var(--panel-2);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .env-row input:focus {
      outline: 1px solid var(--accent);
      border-color: var(--accent);
    }
    .env-row input[readonly] {
      background: transparent;
      border-color: transparent;
      padding-left: 0;
    }
    .env-row .env-key {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .env-value-wrap {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    .env-row .env-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .env-row-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .env-row-actions button {
      font-size: 12px;
      padding: 6px 10px;
    }
    .env-empty {
      padding: 28px 16px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    .env-plane-footer {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 12px 14px;
      border-top: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel-2) 55%, transparent);
    }
    .env-advanced {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel);
      overflow: hidden;
    }
    .env-advanced > summary {
      cursor: pointer;
      user-select: none;
      padding: 10px 14px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    .env-advanced > summary:hover { color: var(--text); }
    .env-advanced[open] > summary {
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    .env-advanced-body { padding: 12px 14px 14px; }
    @media (max-width: 760px) {
      .env-plane-head { display: none; }
      .env-row {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .env-row-actions { justify-content: flex-start; }
    }
    .config-editor-card .head { margin-bottom: 10px; }
    .config-toolbar {
      display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
      margin-bottom: 10px;
    }
    .config-meta {
      color: var(--muted);
      font-size: 12px;
      margin-left: auto;
      text-align: right;
    }
    .config-editor-shell {
      position: relative;
      width: 100%;
      min-height: 520px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--panel-2);
      overflow: hidden;
    }
    .config-editor-shell:focus-within {
      outline: 1px solid var(--accent);
      border-color: var(--accent);
    }
    .config-editor-shell.dirty {
      border-color: color-mix(in srgb, var(--warn) 55%, var(--border-strong));
    }
    .config-highlight,
    .config-editor {
      margin: 0;
      width: 100%;
      min-height: 520px;
      height: 520px;
      box-sizing: border-box;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.5;
      tab-size: 2;
      white-space: pre;
      word-wrap: normal;
      overflow-wrap: normal;
      padding: 14px;
      border: 0;
      border-radius: 10px;
    }
    .config-highlight {
      position: absolute;
      inset: 0;
      overflow: auto;
      color: var(--text);
      background: transparent;
      pointer-events: none;
      z-index: 1;
    }
    .config-highlight code {
      display: block;
      min-height: 100%;
      background: transparent;
      padding: 0;
      border-radius: 0;
      font: inherit;
      white-space: pre;
      color: inherit;
    }
    .config-editor {
      position: relative;
      z-index: 2;
      resize: vertical;
      color: transparent;
      caret-color: var(--text);
      background: transparent;
      overflow: auto;
    }
    .config-editor::selection {
      background: color-mix(in srgb, var(--accent) 35%, transparent);
      color: transparent;
    }
    .tok-key { color: #79b8ff; }
    .tok-string { color: #a5d6ff; }
    .tok-number { color: #f2cc60; }
    .tok-bool { color: #7ee787; }
    .tok-null { color: #ffa198; }
    .tok-comment { color: #8b949e; font-style: italic; }
    .tok-punct { color: #8b949e; }
    .tok-list { color: #d2a8ff; }
    .tok-env { color: #ffa657; }
    .tok-plain { color: var(--text); }
    .config-note {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .config-status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .config-status.ok { color: var(--ok); }
    .config-status.warn { color: var(--warn); }
    .config-status.err { color: var(--danger); }

    /* Provider config editor (Ollama / DeepSeek / etc.) */
    #panel-provider {
      max-width: 920px;
    }
    .provider-config-form {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .provider-config-card {
      display: grid;
      gap: 18px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel);
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .provider-config-form.dirty .provider-config-card {
      border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    }
    .provider-config-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      min-width: 0;
    }
    .provider-config-head-copy {
      min-width: 0;
      flex: 1 1 auto;
    }
    .provider-config-kicker {
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .provider-config-name {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .provider-config-description {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--muted);
    }
    .provider-enabled-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      margin: 0;
      padding: 8px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      background: var(--panel-2);
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    .provider-enabled-toggle input {
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: var(--accent);
    }
    .provider-config-fields {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      min-width: 0;
    }
    .provider-field {
      display: grid;
      gap: 6px;
      min-width: 0;
      margin: 0;
    }
    .provider-field > span {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
    }
    .provider-field input,
    .provider-model-grid label input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      color: var(--text);
      background: var(--panel-2);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      padding: 9px 11px;
    }
    .provider-field input:focus,
    .provider-model-grid label input:focus {
      outline: 1px solid var(--accent);
      border-color: var(--accent);
    }
    .provider-config-models-section {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding-top: 4px;
      border-top: 1px solid var(--border);
    }
    .provider-config-models-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }
    .provider-config-models-head h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
      color: var(--text);
    }
    .provider-config-models-head .muted {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 1.4;
    }
    .provider-config-models {
      display: grid;
      gap: 12px;
      min-width: 0;
    }
    .provider-model-empty {
      padding: 14px 16px;
      border: 1px dashed var(--border-strong);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel-2) 70%, transparent);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }
    .provider-model-card {
      position: relative;
      margin: 0;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel-2);
      padding: 14px 14px 12px;
    }
    .provider-model-card legend {
      padding: 0 6px;
      font-size: 12px;
      font-weight: 650;
      color: var(--muted);
    }
    .provider-model-remove {
      position: absolute;
      top: 10px;
      right: 10px;
    }
    .provider-model-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
      min-width: 0;
      padding-top: 4px;
    }
    .provider-model-grid label {
      display: grid;
      gap: 6px;
      min-width: 0;
      margin: 0;
    }
    .provider-model-grid label > span {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
    }
    .provider-model-visible {
      display: inline-flex !important;
      align-items: center;
      gap: 8px;
      grid-template-columns: none !important;
      padding-top: 22px;
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
    }
    .provider-model-visible input {
      width: 14px !important;
      height: 14px;
      margin: 0;
      accent-color: var(--accent);
    }
    .provider-config-footer {
      display: grid;
      gap: 8px;
      min-width: 0;
      padding-top: 4px;
      border-top: 1px solid var(--border);
    }
    .provider-config-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .provider-config-footer .config-status,
    .provider-config-footer .config-note {
      margin-top: 0;
    }
    @media (max-width: 900px) {
      .provider-config-fields {
        grid-template-columns: 1fr;
      }
      .provider-model-grid {
        grid-template-columns: 1fr;
      }
      .provider-model-visible {
        padding-top: 0;
      }
      .provider-config-head,
      .provider-config-models-head {
        flex-direction: column;
        align-items: stretch;
      }
      .provider-enabled-toggle {
        width: fit-content;
      }
    }


    .picker-stage {
      display: grid;
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }
    .picker-menu {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--border-strong);
      background: color-mix(in srgb, #141414 92%, black);
      box-shadow: 0 16px 50px rgba(0,0,0,0.45);
      overflow: hidden;
      min-height: 420px;
    }
    .picker-menu-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--border);
    }
    .picker-menu-title {
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
      padding: 2px 4px 8px;
    }
    .picker-settings {
      display: grid;
      gap: 2px;
      margin-bottom: 4px;
    }
    .picker-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 80%, transparent);
      color: var(--text);
      font-size: 13px;
    }
    .picker-setting-row .label { color: var(--muted); }
    .picker-setting-row .value {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text);
      max-width: 180px;
    }
    .picker-setting-row .value span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .picker-setting-row .chev {
      color: var(--muted);
      font-size: 12px;
    }
    .picker-list {
      max-height: 320px;
      overflow: auto;
      padding: 6px;
    }
    .picker-item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--text);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .picker-item:hover { background: rgba(255,255,255,0.04); }
    .picker-item.active {
      background: rgba(255,255,255,0.07);
    }
    .picker-item .name {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .picker-item .meta {
      color: var(--muted);
      font-size: 11px;
      flex-shrink: 0;
    }
    .picker-details {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel);
      padding: 16px;
      box-shadow: var(--shadow);
      min-height: 420px;
    }
    .picker-details h3 {
      margin: 0 0 4px;
      font-size: 16px;
      letter-spacing: -0.02em;
    }
    .picker-details .sub {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 14px;
    }
    .picker-kv {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 8px 12px;
      font-size: 13px;
    }
    .picker-kv .k { color: var(--muted); }
    .picker-kv .v { color: var(--text); word-break: break-word; }
    .picker-effort-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .effort-chip {
      border: 1px solid var(--border-strong);
      background: var(--panel-2);
      color: var(--muted);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .effort-chip.active {
      color: var(--text);
      border-color: color-mix(in srgb, var(--accent) 50%, var(--border-strong));
      background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
    }
    @media (max-width: 900px) {
      .picker-stage { grid-template-columns: 1fr; }
    }

    .empty { color: var(--muted); font-size: 13px; padding: 24px; text-align: center; }
    .skeleton { background: linear-gradient(90deg, var(--panel-2) 25%, var(--panel) 50%, var(--panel-2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; height: 16px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .endpoints { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
    /* Pairing page */
    .pairing-page {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .pairing-shell {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .pairing-card,
    .pairing-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .pairing-card {
      display: grid;
      gap: 0;
      overflow: hidden;
      padding: 0;
    }
    .pairing-section {
      padding: 18px;
      border-bottom: 1px solid var(--border);
    }
    .pairing-section:last-child { border-bottom: 0; }
    .pairing-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }
    .pairing-kicker {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .pairing-title,
    .pairing-panel h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .pairing-desc,
    .pairing-panel .muted,
    .muted {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .pairing-mode-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
      gap: 16px;
      align-items: center;
    }
    .pairing-mode-toggle {
      display: inline-flex;
      width: min(360px, 100%);
      padding: 4px;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      background: var(--panel-2);
      gap: 4px;
    }
    .pairing-mode-toggle button {
      flex: 1;
      min-height: 36px;
      border-radius: 9px;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
      padding: 7px 12px;
    }
    .pairing-mode-toggle button.primary,
    .pairing-mode-toggle button[aria-pressed="true"] {
      background: color-mix(in srgb, var(--accent) 16%, var(--panel));
      color: var(--text);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .pairing-state-card {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-2) 75%, transparent);
    }
    .pairing-state-line {
      font-size: 14px;
      font-weight: 650;
      color: var(--text);
    }
    .pairing-refresh {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .pairing-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--ok);
      box-shadow: 0 0 10px color-mix(in srgb, var(--ok) 65%, transparent);
    }
    .pairing-command-box {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--bg) 88%, var(--panel));
    }
    .pairing-code-box {
      min-width: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.55;
    }
    .pairing-command {
      color: var(--text);
      overflow-wrap: anywhere;
      user-select: all;
    }
    .pairing-copy {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      flex: 0 0 40px;
    }
    .pairing-copy svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .pairing-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    .pairing-expiry {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .pairing-clients {
      display: grid;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: color-mix(in srgb, var(--bg) 88%, var(--panel));
    }
    .pairing-client-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .pairing-client-row:last-child { border-bottom: 0; }
    .pairing-client-identity {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .pairing-client-identity strong {
      display: block;
      font-size: 13px;
      font-weight: 600;
    }
    .pairing-client-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: 1px solid var(--border-strong);
      background: var(--panel-2);
      color: var(--text);
      flex-shrink: 0;
    }
    .pairing-client-icon svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .pairing-scopes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .pairing-scope-chip {
      display: inline-flex;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
    }
    .pairing-security-note {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 16px;
      border: 1px solid color-mix(in srgb, var(--ok) 25%, var(--border));
      border-radius: 12px;
      background: color-mix(in srgb, var(--ok) 8%, var(--panel));
      color: var(--text);
      font-size: 12px;
      line-height: 1.45;
    }
    .pairing-security-icon {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      color: var(--ok);
    }
    .pairing-security-icon svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .pairing-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .pairing-empty {
      padding: 22px 16px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 820px) {
      .pairing-mode-grid { grid-template-columns: 1fr; }
      .pairing-section-head { flex-direction: column; align-items: stretch; }
      .pairing-command-box { grid-template-columns: 1fr; }
      .pairing-copy { width: 100%; }
      .pairing-client-row {
        flex-direction: column;
        align-items: stretch;
      }
    }

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
      background: var(--panel); border: 1px solid var(--border-strong);
      border-radius: 10px; padding: 12px 14px; box-shadow: var(--shadow);
      animation: slide-in 0.2s ease;
    }
    .toast .t { font-weight: 600; font-size: 13px; }
    .toast .d { font-size: 12px; color: var(--muted); margin-top: 2px; word-break: break-word; }
    @keyframes slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    @media (max-width: 900px) {
      .span-4, .span-6, .span-8 { grid-column: span 12; }
    }
    @media (max-width: 900px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar {
        position: sticky; top: 0; height: auto; width: 100%;
        flex-direction: row; align-items: center; justify-content: space-between;
        gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--border);
      }
      .sidebar-brand { padding: 0; }
      .sidebar-brand .brand-tag { display: none; }
      .sidebar-nav {
        flex-direction: row; width: auto; flex: 1; justify-content: flex-end;
        overflow-x: auto; gap: 4px;
      }
      .sidebar-footer {
        width: auto; flex-direction: row; padding: 0; border-top: 0;
      }
      .nav-item, .sidebar-link {
        width: auto; min-height: 36px; padding: 0 10px; border-radius: 10px;
      }
      .nav-item .nav-label, .sidebar-link .nav-label { display: none; }
      .nav-separator { display: none; }
      .nav-item.active::before { display: none; }
      .topbar-inner, .content { padding-left: 16px; padding-right: 16px; }
      .doctor-grid { grid-template-columns: 1fr; }
      .endpoints { grid-template-columns: 1fr; }
    }
  `;
}

function icon(name) {
  const icons = {
    cursor: '<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M8 15.5 16 8.5"></path><path d="M8.5 8.5h7v7"></path></svg>',
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>',
    models: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h10"></path><circle cx="18.5" cy="17" r="2"></circle></svg>',
    pairing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5 7 16a4 4 0 1 0 5.7 5.7l1.8-1.8"></path><path d="m15.5 9.5 1.5-1.5A4 4 0 1 0 11.3 2.3L9.5 4.1"></path><path d="m9 15 6-6"></path></svg>',
    codex: '<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="evenodd"><path clip-rule="evenodd" d="M8.086.457a6.105 6.105 0 0 1 3.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 0 0 .107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 0 1-.18 1.631.167.167 0 0 0 .04.155 5.982 5.982 0 0 1 1.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 0 1-2.934 1.851.162.162 0 0 0-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 0 0-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 0 1-2.595-.622 6.058 6.058 0 0 1-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 0 1-.495-1.283 6.11 6.11 0 0 1-.017-3.064.166.166 0 0 0 .008-.074.115.115 0 0 0-.037-.064 5.958 5.958 0 0 1-1.38-2.202 5.196 5.196 0 0 1-.333-1.589 6.915 6.915 0 0 1 .188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 0 0 .087-.087A6.016 6.016 0 0 1 5.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 0 0-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 0 0 1.46.864l1.94-3.272a.849.849 0 0 0 .007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 0 0 0 1.695h4.848a.849.849 0 0 0 0-1.696h-4.848z"></path></svg>',
    cline: '<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="evenodd"><path d="M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 0 1-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 0 1-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 0 0-2.274 2.274v4.042a2.274 2.274 0 0 0 4.547 0v-4.042A2.274 2.274 0 0 0 8.265 9.6zm7.326 0a2.274 2.274 0 0 0-2.274 2.274v4.042a2.274 2.274 0 1 0 4.548 0v-4.042A2.274 2.274 0 0 0 15.59 9.6z"></path><path d="M12.054 5.558a2.779 2.779 0 1 0 0-5.558 2.779 2.779 0 0 0 0 5.558z"></path></svg>',
    grok: '<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 0 0-1.829-1A8.975 8.975 0 0 0 5.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path></svg>',
    modelsApi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"></path><path d="M10 14 21 3"></path><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"></path></svg>',
    config: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
  };
  return icons[name] || "";
}

function shell() {
  return `
    <div class="shell">
      <aside class="sidebar" aria-label="Primary">
        <a class="sidebar-brand" href="#overview" data-view="overview" title="Shimex">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAOlUlEQVR42u2ae5Cdd1nHP8/vvZzrXpPsJt2k26RtQi6l6Q1Kr8GCsY5UxNnYjAojqMwoHccR5eIlCQ6aglMuIl7oIDhKS1YrYGktBdpKC73YS1qyLSZlc9tcdvfs7jl7Lu/t93v8410Kjjo0bQqt7nfmnbN7zsz7O8/3fb7P9cAiFrGIRSxiEYtYxCIWsYiXCroDozriqV7tq+7w9Z6rfd0z4qki/7cN1xFPVQ3/q52C6h5PdYf5cX1HeameuHzAONTl/z/MKpZv2UBxzRBhIYRsjmxinKk7xmQ98zlZezyRbfYVT4DuwZNtYhUVHtuwnaFr3u7CgUtNV7mCFwIBUAI8SJOjZEdvZ+6jfy5nzIypqmF0mzAC3DspTA0oI6NOBH1FEPCc8X+jm7n6uk9w5qbL0VloHQQ6ljB0+N3gVQVTMQSDBs6BJI3ofH2X9H5293+/q0H1Vg+2qQjuZUvAc8Z/Rq/ldW/aw4rBKtMPpfiZEPYbgqoQVMCvgF9aODpRXMfC2T6Fy4TZO2+medenKFy4EpsYOodOsu+xp+U6pvMzRjzZNmpfdgQ8Z/xNeiFXXfkAQ0NFph9IKff7+B6EJQiK4BXAD8EE+d8YUAe2rjCgVH7KIz2Zq0Rj6GTQiWo0x7/GE5+5Sd7MQ6o7DLJLhdMjC3nxkR5hdMTw6VGfX13+CK/bch7H788oVT1CH4o94HugKQQlMAaMByYELwSX5Ka4GKTiUCdks444ggyD12/oXgft0LH/Kx+Uq/b+0ekkQV6U4TvxeNNFIhc/nurH2c4Vr/0cJsmIT/qUykpgoLwUxIKLci8wPngeiP/9050FMaAWnANVSGNIE0g7ynzNEa42nHmJ4eF7b5atY792uuTwggjQETwZ5bnD9ddZygXcypVbXk993OF7Hj4QhOApGAHPzy8/yE81PuByGYj5PhHq8rfTCJII0gxSoDUNXk/K8GtCe8/Xf89/29yHdY96sg37IyXgOb3/lvbaTbzDG177Flddsl68Up94qTLzDJSKEEiuZb/wvWCeu763YLwx+atmueEmBBaevHWQJZBZsApJCqmFdl3pPVNdVMmSu/duKO7WcXaIsIsXLAf/BRm/W69luO8vvPMvWE2mmOlJaB9VbBs8ASKIHZT7IZkFvwxeAMZBRv5qyA0udAvWKXEzZylLwGb5lToIKhA1czlIUZg8bM3QmoKsKv+2IDfoFjzZRaaKvJB6QU7N7cXqbr2eVUtu4byL4dD+lMaUIfAF5wQRMODSGD3vl/BWXw+1R+DwhyGsLFC+EPg8kxNQ7BPNIiRpKu57MtDc9TMHSQyF/pyAVh2STOntlc7R7Hj91rm1K+6m9WIk8Lxq8D0LmtcP+ZvpLX+WV13o+M6TGXNTPkHRoEZQyb90s02rVRRZtRrsv8PQT0DfCDQncy13OtCJoZ1AOxVqx5G5GrQS6KQQZflnnQwShU6K9q0Vra4Ukgi6KkIaERbSM/QcXqXP0qMPysf1QVY+F5xPNwEjG1BVFZukn2DdxpDpCUdn3qNQzAOZWhCFvh6c79E+WSc++Fju+q37Yfht4AYg7kBqoJ3mBrYSJRGIVOmk0IyhlUGkkAq0I4gz2P8AMvGUUvBx698KQ+daL2ijBW8lGUuczxVE9AGw8zQToHvwZBeOP5ErvP7y5a5QsUxPeJRLeXozmmu6UoK4jRFHMXA6c9/XIJ0F24GwDmfdAM0paLUhstCKoR3n3tBJFgy3C5dCswPecui7EGlnSmZg1db8Puf+ilLuI6iYpbKO784/rNfIFp4CkF2nVi7/8CC4DwHBqV5nli1T0pZDnMkNX6DQ88C1QTIw0DXo0zowy/wTX5WuS69XWo/BmdfCkdfA7BN5M/S93J+ligio5BEft5ACE7QUiEioubwc7P0yhgyaTwn1OUAaqmq489y26oEXFAR/uATGFm7q2ESxKkZjySs8D0oeVA10+9DjQVmgmDd61X6h/q2H1M0fAa8E7hlY+zu5S6cpRG1oN6DdhOY8tBqQtKHZhqE34pZcIHL8P9Q9+02iyZTWfC/pmu3YWobdf8JLa07n99qHOLj5JoZLH2QnontGvNOfBvfgEAHRPsSAESHwoOBBOQTfAQsVnBNIBZMZij1K+1BM44Ev0rv1N3GdcczgG2HgOtj/BWz3GiQcBLX52EAMok1Mex8cexzieY1nITK9yMbXU968RvzqEXWF18LMG2Df19M19u5hju79FMMXGXaOCDtH9fQTsBPJ8xIJcQLlPogDqPhQLQEpZBFYA6GBggEEP1NKVYtrRyB5qMBvEUdlUI/Cm/8QwuFcOkjeK3gh6Rf/GPf0t0i9UHTdVi1tXidh7wTM/jPaaYlZ/h11g+sJBq8M2LTlPk6O/y2fvPlG2f2ozbO6nmYCNi5EVcMxGnVcaVhNEgilUJE4r+zE5B4gC6KyFptYrO9L91U/CylKpY/Os5Nk+24TLYhm37ldgp4BVZsIGBVRkALNiaOYFRdL6cqrKVTHhal/RPcfA7+I9FvVSizSbIH7N8X2w5qfeTvv3P1Wveyuv+Lme97PF7UJwvONB88zCCoa8DCt6V9wpqKmXFQ0A/FyoyXNO752nOfxTOnMOMJNl+APvEpp1XDeRTS/8gd0lyMl8Gnf9U/aAUFFnQPFCIlVW1jCwFvepP7Ep8menMA1u/A33oDp3AYmQ4q/rBz/GMyFkM5Atjtz4QXGXLb9XfGBx5YVxVyfzxh36ekqhR1AZqp3iG1+SCaOeaxbBbUDoD7EUa6Q2EEEJCLpbKq2WKb7omuVdgu6VlO/52v4c49QWFOEQCks90FRrObeEjltz0CDbsz802QTUxJ926kZLhJe8lrcwXMwT/0utG4RXCFPi5ORZLWib6qPW7pXWWv8SxU1Ih9wSp5bXnQWkF043YEpvrv5jCbyVW/scRNH/ZZyKc/ViUDbQVMhFkjRuKWULv1pKA5BoEQTEfHDf0lluQcFhb4QloQwUIABH2+pT9hv8MugLs6vzKgpGaIDx2l/6x8wZw2Rln8exibUjTXJnmmQHrQaT0bqsrLgEs8mWTyaB5TTWwkyhihInPm/7zqJy+7+BlnXRqVahDgFK3kGUA/UkFowvYNQLuBML7P/+kmqXfP4XT70+NBXzVNo2aD9PUJPEUpePhJwIDYWF2ViMQRFQ+1f7hFX24ucdw21IyWa0XrpuKtol6+ibZfiohQUrHue9pwqATKKZQRTeV/6aOzM+yvpCb9z1yM2qa53DPSDJgt3M2CEsGCYvfMW5r5xK7XbPkGp9QilJQEmIJ8HRJ1cWF5xYRqkEING4FIHWYTGTuOGpTPj8JcNqqkO0nzmSeamMylt365d73gnPe+6AXvOZWT1FBxk6UvYDssoNm+H3Y2tG73eLg6/t/2lGZKLNrjyqh5j5meVRh1MQiUo4NVm6Tx0B+USUlwWqOdLni3aKQQGAg+SDpIkStNhaxbXIu8AbYztOGnNqYZ9FQZ+8e1kcZHGl28lyFI9dNNH0LCCOoXaNN1neZDaF0TAKbmMbMtJqLzHvq8Vm7eFpnmIrz5s6k/MKwO90GNhwIN+pTgU0ndOgcqSUD2zYHwKJEDHQSODuRSmHUxmuDmHa4JBIeqodjKas4otF5GqkZnb/p5SPEnXMo+u5iyVyaMERycIScV2LC5ONc1EX9KByA+SINvc3038WfWO/nLr9rB+4jU2Xe+8zqzBhRAGeWawGTgDljxGWCDT3OU1Fy2pg2aGnYdOHaajFssDpHp2lVXalKnDNQ685wMU01TKXUY1ceAZnDGUux2F0Km/atCa/t4gaSThvoUIKC+FB/wXEj5GYejdzWmpypfCdEbSVtUxdBb4FopBPhLzAd98v9GxConLa4VmhpvLiCct9ZrHzIxP7Amu0eabn3pWD7OC7iuHOfvqMivOSPG7jEZtyAKD1w29yzL61/a46tYrxDv7wuDgnkeno6n2zl2I0x2Y51sSyovZ/7ETjT5XWB2aeCwNB3z/jZeLN3mv6ExbRAtKy0IHaDmIHC622LZiO4qNlCyGtKXIkm6kGIhtzGi7KRw75DhRQ6qb+tm4tZ8zBlLlyLS2DrZEgPLyLudWrzXW75VD9x2OZx7c//m5Gh/f+g19TEVOKQ/Ki1+IYO1d8qcm0PdG7bPj4PJzQ2/mUThZhzSAtuZ1wrzFNixpA7LIoeTjMwRclrfWTiHNJG8Om8rxw9DIhDOuWCavfsMg1UIHtKC2tEwO3n+cyQeevbM+kf21vaz80NLKGe3q2IFo0yjJj2wxki9FMPvAWz8od5hMr4nmlqXeq1eboDhrmK1BPRLmrTJvoWFJGqo2QmwMTgUJ8mGxeKCqpBF05qFRg8SJC6pqxvbiTNl7cu1Prjy/3F0wJ+4/9GBjPL45PL9wH+XuJlNJtOWseuNUhyGnbTMkgk59ga7+HvmscfpztHzSYIlq1XfidVRbMXYqkfi4Na1xJ3ECA8NYcRiXwkK7jbp8JBC3UA1xxR7xj40rR6blo5Uh/XzzadYFoN4wj4er++Zax9Ko2WzWt53iUz/9u8EfGEnHt5t3+EPl3zATzc3MYpgHOuCaMDMN8y0OOsuZ1TLG64VCBWsExS2MFMD4AUZS4ci41k7UuClaGnxZYiRcVp6zFS8tzcSplFrzl32EzstnO5yvykR24b69g/6V53sXFxPdrHUd0pb6NmKmXmd8JuHZSsaGMGF7mnBJd5ViqZrvSxWh3VZaTY43m3xl2nJLsxKO+5GkJo5nOn2k0SzZyCjpy2Y5+j8Fxnv3IZ/chW4Y2eCtOutkYWWWBmKsXzHOL0ad0nyCdUJhhXBO0bFRM1Zi8a0yG1u+W7OMzRaKRytGrJNOVDhA4/X3kb1ifiLzgwGSWcz+CMMBaMS4+RVooUEQz1CY8jFpGyOKRwV8h/MzXGhxlZR0CjrbRrGvuN8InQpJj74Tv7uQF2TJCXQM7Ett9CIWsYhFLGIRi1jEIhaxiEUs4v87/hNJ8cAYZ6u9fAAAAABJRU5ErkJggg==" alt="Shimex" width="28" height="28" />
          <span class="brand-copy">
            <span class="brand-name">Shimex</span>
            <span class="brand-tag">Control plane</span>
          </span>
        </a>
        <nav class="sidebar-nav">
          <a class="nav-item active" href="#overview" data-view="overview" title="Overview" aria-label="Overview"><span class="nav-icon">${icon("overview")}</span><span class="nav-label">Overview</span></a>
          <a class="nav-item" href="#pairing" data-view="pairing" title="Pairing" aria-label="Pairing"><span class="nav-icon">${icon("pairing")}</span><span class="nav-label">Pairing</span></a>
          <div class="nav-separator">Provider</div>
          <a class="nav-item" href="#codex" data-view="codex" title="Codex profiles" aria-label="Codex profiles"><span class="nav-icon">${icon("codex")}</span><span class="nav-label">Codex</span></a>
          <a class="nav-item" href="#cursor" data-view="cursor" title="Cursor subscription" aria-label="Cursor subscription"><span class="nav-icon">${icon("cursor")}</span><span class="nav-label">Cursor</span></a>
          <a class="nav-item" href="#grok" data-view="grok" title="Grok session" aria-label="Grok session"><span class="nav-icon">${icon("grok")}</span><span class="nav-label">Grok</span></a>
          <a class="nav-item" href="#cline" data-view="cline" title="Cline profiles" aria-label="Cline profiles"><span class="nav-icon">${icon("cline")}</span><span class="nav-label">Cline</span></a>
          <div id="provider-config-nav">
            <a class="nav-item" href="#provider-ollama" data-view="provider-ollama" data-provider-config-id="ollama" title="Ollama" aria-label="Ollama" hidden><span class="nav-icon">${providerNavIcon("ollama")}</span><span class="nav-label">Ollama</span></a>
            <a class="nav-item" href="#provider-deepseek" data-view="provider-deepseek" data-provider-config-id="deepseek" title="DeepSeek" aria-label="DeepSeek" hidden><span class="nav-icon">${providerNavIcon("deepseek")}</span><span class="nav-label">DeepSeek</span></a>
            <a class="nav-item" href="#provider-cloudflare-workers-ai" data-view="provider-cloudflare-workers-ai" data-provider-config-id="cloudflare-workers-ai" title="Cloudflare Workers AI" aria-label="Cloudflare Workers AI" hidden><span class="nav-icon">${providerNavIcon("cloudflareWorkers")}</span><span class="nav-label">Cloudflare Workers AI</span></a>
            <a class="nav-item" href="#provider-openai-responses" data-view="provider-openai-responses" data-provider-config-id="openai-responses" title="OpenAI Responses" aria-label="OpenAI Responses" hidden><span class="nav-icon">${icon("codex")}</span><span class="nav-label">OpenAI Responses</span></a>
            <a class="nav-item" href="#provider-lm-studio" data-view="provider-lm-studio" data-provider-config-id="lm-studio" title="LM Studio" aria-label="LM Studio" hidden><span class="nav-icon">${providerNavIcon("lmStudio")}</span><span class="nav-label">LM Studio</span></a>
          </div>
          <div class="nav-separator">Advanced</div>
          <a class="nav-item" href="#config" data-view="config" title="Config" aria-label="Config"><span class="nav-icon">${icon("config")}</span><span class="nav-label">Config</span></a>
        </nav>
        <div class="sidebar-footer">
          <a class="sidebar-link" href="/v1/models" target="_blank" rel="noreferrer" title="/v1/models" aria-label="Open /v1/models"><span class="nav-icon">${icon("modelsApi")}</span><span class="nav-label">/v1/models</span></a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar">
          <div class="topbar-inner">
            <div class="brand-block">
              <div class="eyebrow">Shimex</div>
              <h1 id="view-title">Overview</h1>
              <p id="view-subtitle">Doctor status, endpoints, and gateway health.</p>
            </div>
            <div class="topbar-actions">
              <div class="status">
                <span id="health-pill" class="health-dot" role="status" aria-label="connecting…" title="connecting…"></span>
              </div>
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
              <div class="card span-12">
                <div class="head">
                  <h2>Subscription usage</h2>
                  <span class="meta" id="usage-overview-meta">loading…</span>
                </div>
                <div class="usage-overview" id="usage-overview">
                  <div class="usage-overview-card"><div class="muted">Loading Codex…</div></div>
                  <div class="usage-overview-card"><div class="muted">Loading Cline…</div></div>
                  <div class="usage-overview-card"><div class="muted">Loading Grok…</div></div>
                </div>
              </div>
              <div class="card span-12" id="models-section">
                <div class="head">
                  <h2>Model picker preview</h2>
                  <span class="meta"><span id="model-count">0</span> visible in Codex</span>
                </div>
                <div class="toolbar">
                  <input id="search" type="search" placeholder="Filter picker labels, slug, upstream, or provider…" autocomplete="off" />
                  <select id="provider-filter" aria-label="Filter by provider"><option value="">All providers</option></select>
                  <select id="modality-filter" aria-label="Filter by input modality">
                    <option value="">All modalities</option>
                    <option value="text">Text only</option>
                    <option value="image">Vision-capable</option>
                  </select>
                  <button class="ghost" id="refresh" type="button">Refresh</button>
                </div>
                <div class="picker-stage">
                  <div class="picker-menu" aria-label="Codex model picker preview">
                      <div class="picker-menu-head">
                        <div class="picker-settings">
                          <div class="picker-setting-row">
                            <span class="label">Model</span>
                            <span class="value"><span id="picker-selected-label">—</span><span class="chev">›</span></span>
                          </div>
                          <div class="picker-setting-row">
                            <span class="label">Effort</span>
                            <span class="value"><span id="picker-selected-effort">—</span><span class="chev">›</span></span>
                          </div>
                        </div>
                        <div class="picker-menu-title">Model</div>
                      </div>
                      <div class="picker-list" id="picker-list">
                        <div class="empty">Loading models…</div>
                      </div>
                    </div>
                  <div class="picker-details" id="picker-details">
                    <div class="empty">Select a model to inspect catalog metadata.</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

                    <section class="panel" id="panel-config" data-panel="config">
            <div class="grid">
              <div class="card span-12 config-editor-card">
                <div class="head">
                  <h2>Host configuration</h2>
                  <span class="meta" id="config-active-label">shimex.yml + .env</span>
                </div>
                <div class="config-tabs" role="tablist" aria-label="Config files">
                  <button class="config-tab active" type="button" data-config-tab="yml" id="config-tab-yml">shimex.yml</button>
                  <button class="config-tab" type="button" data-config-tab="env" id="config-tab-env">.env</button>
                </div>

                <div class="config-pane active" id="config-pane-yml" data-config-pane="yml">
                  <div class="config-toolbar">
                    <button class="ghost" id="config-reload" type="button">Reload</button>
                    <button class="ghost" id="config-validate" type="button">Validate</button>
                    <button class="primary" id="config-save" type="button">Save</button>
                    <button class="ghost" id="config-save-restart" type="button">Save + restart</button>
                    <div class="config-meta" id="config-meta">local host only</div>
                  </div>
                  <div class="config-editor-shell" id="config-editor-shell">
                    <pre class="config-highlight" id="config-highlight" aria-hidden="true"><code id="config-highlight-code"></code></pre>
                    <textarea id="config-editor" class="config-editor" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
                  </div>
                  <div class="config-note">
                    Source of truth for providers, endpoints, and model lists. Keep secrets as <code>\${ENV_NAME}</code> references. Saving writes <code>shimex.yml</code>; restart applies it.
                  </div>
                  <div class="config-status" id="config-status">Loading shimex.yml…</div>
                  <div class="config-note" id="config-path">path loading…</div>
                </div>

                <div class="config-pane" id="config-pane-env" data-config-pane="env">
                  <div class="config-toolbar">
                    <button class="ghost" id="env-reload" type="button">Reload</button>
                    <button class="primary" id="env-save" type="button">Save</button>
                    <button class="ghost" id="env-save-restart" type="button">Save + restart</button>
                    <div class="config-meta" id="env-meta">local host only · values hidden</div>
                  </div>

                  <div class="env-plane" id="env-plane">
                    <div class="env-plane-head">
                      <div>Key</div>
                      <div>Value</div>
                      <div>Actions</div>
                    </div>
                    <div class="env-rows" id="env-rows">
                      <div class="env-empty">Loading environment variables…</div>
                    </div>
                    <div class="env-plane-footer">
                      <button class="ghost" id="env-add" type="button">Add variable</button>
                      <button class="ghost" id="env-hide-all" type="button">Hide all values</button>
                    </div>
                  </div>

                  <details class="env-advanced" id="env-advanced">
                    <summary>Advanced: raw .env editor</summary>
                    <div class="env-advanced-body">
                      <div class="config-editor-shell" id="env-editor-shell">
                        <pre class="config-highlight" id="env-highlight" aria-hidden="true"><code id="env-highlight-code"></code></pre>
                        <textarea id="env-editor" class="config-editor" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
                      </div>
                      <div class="config-toolbar" style="margin-top:10px;">
                        <button class="ghost" id="env-validate" type="button">Validate raw</button>
                        <button class="ghost" id="env-apply-raw" type="button">Apply raw to plane</button>
                      </div>
                    </div>
                  </details>

                  <div class="config-note">
                    Vercel-style secret plane: keys are visible, values stay hidden until you reveal them. Saving writes <code>.env</code> on this host; restart applies values to the running process.
                  </div>
                  <div class="config-status" id="env-status">Loading .env…</div>
                  <div class="config-note" id="env-path">path loading…</div>
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

          <section class="panel" id="panel-cursor" data-panel="cursor">
            <div class="grid">
              ${cursorAuthsCard()}
            </div>
          </section>

          <section class="panel" id="panel-cline" data-panel="cline">
            <div class="grid">
              ${clineAuthsCard()}
            </div>
          </section>

          <section class="panel" id="panel-grok" data-panel="grok">
            <div class="grid">
              ${grokAuthsCard()}
            </div>
          </section>

          ${providerConfigCard()}
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
      config: { title: "Config", subtitle: "Edit shimex.yml and .env on this host. Restart to apply." },
      pairing: { title: "Pairing", subtitle: "Host mode, client commands, and paired machines." },
      codex: { title: "Codex profiles", subtitle: "Connected OpenAI Codex accounts and usage." },
      cursor: { title: "Cursor subscription", subtitle: "Sign in with Cursor and use your local subscription session." },
      cline: { title: "Cline profiles", subtitle: "Connected Cline accounts and usage." },
      grok: { title: "Grok session", subtitle: "Local Grok subscription session and usage." },
    };

    const els = {
      healthPill: document.getElementById("health-pill"),
      doctorMeta: document.getElementById("doctor-meta"),
      doctor: document.getElementById("doctor"),
      usageOverview: document.getElementById("usage-overview"),
      usageOverviewMeta: document.getElementById("usage-overview-meta"),
      modelCount: document.getElementById("model-count"),
      search: document.getElementById("search"),
      providerFilter: document.getElementById("provider-filter"),
      modalityFilter: document.getElementById("modality-filter"),
      refresh: document.getElementById("refresh"),
      toasts: document.getElementById("toasts"),
      topbar: document.getElementById("topbar"),
      viewTitle: document.getElementById("view-title"),
      viewSubtitle: document.getElementById("view-subtitle"),
      modelsSection: document.getElementById("models-section"),
      pickerList: document.getElementById("picker-list"),
      pickerSelectedLabel: document.getElementById("picker-selected-label"),
      pickerSelectedEffort: document.getElementById("picker-selected-effort"),
      pickerDetails: document.getElementById("picker-details"),
      configEditor: document.getElementById("config-editor"),
      configEditorShell: document.getElementById("config-editor-shell"),
      configHighlight: document.getElementById("config-highlight"),
      configHighlightCode: document.getElementById("config-highlight-code"),
      configPath: document.getElementById("config-path"),
      configMeta: document.getElementById("config-meta"),
      configStatus: document.getElementById("config-status"),
      configReload: document.getElementById("config-reload"),
      configValidate: document.getElementById("config-validate"),
      configSave: document.getElementById("config-save"),
      configSaveRestart: document.getElementById("config-save-restart"),
      configTabYml: document.getElementById("config-tab-yml"),
      configTabEnv: document.getElementById("config-tab-env"),
      configPaneYml: document.getElementById("config-pane-yml"),
      configPaneEnv: document.getElementById("config-pane-env"),
      configActiveLabel: document.getElementById("config-active-label"),
      envEditor: document.getElementById("env-editor"),
      envEditorShell: document.getElementById("env-editor-shell"),
      envHighlight: document.getElementById("env-highlight"),
      envHighlightCode: document.getElementById("env-highlight-code"),
      envPath: document.getElementById("env-path"),
      envMeta: document.getElementById("env-meta"),
      envStatus: document.getElementById("env-status"),
      envRows: document.getElementById("env-rows"),
      envAdd: document.getElementById("env-add"),
      envHideAll: document.getElementById("env-hide-all"),
      envApplyRaw: document.getElementById("env-apply-raw"),
      envReload: document.getElementById("env-reload"),
      envValidate: document.getElementById("env-validate"),
      envSave: document.getElementById("env-save"),
      envSaveRestart: document.getElementById("env-save-restart"),
    };
    const state = {
      models: [],
      doctor: null,
      health: null,
      view: "overview",
      overviewUsage: { codex: null, cline: null, grok: null, loading: false },
      selectedSlug: "",
      selectedEffort: "",
      configText: "",
      configOriginal: "",
      configPath: "",
      configMtime: "",
      configDirty: false,
      configBusy: false,
      configTab: "yml",
      envText: "",
      envOriginal: "",
      envPath: "",
      envMtime: "",
      envDirty: false,
      envBusy: false,
      envLoaded: false,
      envEntries: [],
      envRevealed: {},
      envSyncingRaw: false,
    };

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
      els.healthPill.setAttribute("aria-label", label);
      els.healthPill.setAttribute("title", label);
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
      if (value === "cursor-auths" || value === "cursor-auths-panel") return "cursor";
      if (value === "cline-auths" || value === "cline-auths-panel") return "cline";
      if (value === "grok-auths" || value === "grok-auths-panel") return "grok";
      if (VIEW_META[value]) return value;
      return "overview";
    }

    function setView(nextView, { updateHash = true } = {}) {
      const rawView = String(nextView || "").replace(/^#/, "").trim().toLowerCase();
      const wantsModelsSection = rawView === "models";
      const providerId = providerIdFromView(rawView);
      const view = providerId ? "provider" : normalizeView(nextView);
      state.view = view;
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.getAttribute("data-view") === (providerId ? ("provider-" + providerId) : view));
      });
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.getAttribute("data-panel") === view);
      });
      const meta = providerId ? providerViewMeta(providerId) : (VIEW_META[view] || VIEW_META.overview);
      els.viewTitle.textContent = meta.title;
      els.viewSubtitle.textContent = meta.subtitle;
      if (wantsModelsSection && els.modelsSection) {
        window.requestAnimationFrame(() => els.modelsSection.scrollIntoView({ block: "start" }));
      }
      if (view === "config") {
        if (els.configEditor && !state.configOriginal && !state.configBusy) loadConfig();
        if (state.configTab === "env" && els.envEditor && !state.envLoaded && !state.envBusy) loadEnv();
      }
      if (view === "provider") renderProviderConfig(providerId);
      if (updateHash) {
        const hash = "#" + (providerId ? ("provider-" + providerId) : view);
        if (location.hash !== hash) history.replaceState(null, "", hash);
      }
    }


    function usageColor(remaining) {
      if (remaining == null || !Number.isFinite(Number(remaining))) return "var(--muted)";
      if (remaining < 10) return "var(--danger)";
      if (remaining < 30) return "var(--warn)";
      return "var(--ok)";
    }

    function usageStateClass(remaining) {
      if (remaining == null || !Number.isFinite(Number(remaining))) return "";
      if (remaining < 10) return "danger";
      if (remaining < 30) return "warn";
      return "ok";
    }

    function usageBar(label, remaining) {
      const safe = remaining == null || !Number.isFinite(Number(remaining))
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(remaining))));
      const color = usageColor(safe);
      return '<div class="usage-overview-bar" style="--usage-color:' + color + '">' +
        '<div class="row"><span>' + escapeHtml(label) + '</span><span>' + (safe == null ? "—" : (safe + "% left")) + '</span></div>' +
        '<div class="track"><div class="fill" style="width:' + (safe == null ? 0 : safe) + '%"></div></div>' +
      '</div>';
    }

    function overviewUsageCard(provider, href, payload) {
      const title = provider;
      if (!payload || payload.loading) {
        return '<div class="usage-overview-card">' +
          '<div class="top"><div class="provider">' + escapeHtml(title) + '</div><span class="state">loading</span></div>' +
          '<div class="muted">Probing remaining usage…</div>' +
        '</div>';
      }
      if (payload.disconnected) {
        return '<div class="usage-overview-card">' +
          '<div class="top"><div class="provider">' + escapeHtml(title) + '</div><span class="state">offline</span></div>' +
          '<div class="muted">' + escapeHtml(payload.message || "Not connected") + '</div>' +
          '<a href="' + escapeHtml(href) + '">Open ' + escapeHtml(title) + '</a>' +
        '</div>';
      }
      if (payload.error) {
        return '<div class="usage-overview-card">' +
          '<div class="top"><div class="provider">' + escapeHtml(title) + '</div><span class="state danger">error</span></div>' +
          '<div class="muted">' + escapeHtml(payload.error) + '</div>' +
          '<a href="' + escapeHtml(href) + '">Open ' + escapeHtml(title) + '</a>' +
        '</div>';
      }
      const remaining = payload.remainingPercent;
      const safe = remaining == null || !Number.isFinite(Number(remaining))
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(remaining))));
      const stateCls = usageStateClass(safe);
      const bars = (payload.bars || []).map((bar) => usageBar(bar.label, bar.remainingPercent)).join("");
      return '<div class="usage-overview-card">' +
        '<div class="top"><div class="provider">' + escapeHtml(title) + '</div><span class="state ' + stateCls + '">' + escapeHtml(payload.subtitle || (safe == null ? "ready" : (safe + "% left"))) + '</span></div>' +
        '<div class="big"><div class="pct" style="color:' + usageColor(safe) + '">' + (safe == null ? "—" : (safe + "%")) + '</div><div class="pct-label">remaining</div></div>' +
        (bars ? ('<div class="bars">' + bars + '</div>') : '') +
        (payload.detail ? ('<div class="muted">' + escapeHtml(payload.detail) + '</div>') : '') +
        '<a href="' + escapeHtml(href) + '">Details</a>' +
      '</div>';
    }

    function renderOverviewUsage() {
      if (!els.usageOverview) return;
      const data = state.overviewUsage || {};
      els.usageOverview.innerHTML = [
        overviewUsageCard("Codex", "#codex", data.codex),
        overviewUsageCard("Cline", "#cline", data.cline),
        overviewUsageCard("Grok", "#grok", data.grok),
      ].join("");
      if (els.usageOverviewMeta) {
        const parts = [];
        for (const key of ["codex", "cline", "grok"]) {
          const item = data[key];
          if (!item || item.loading) { parts.push(key + ": …"); continue; }
          if (item.disconnected) { parts.push(key + ": offline"); continue; }
          if (item.error) { parts.push(key + ": error"); continue; }
          if (item.remainingPercent == null) { parts.push(key + ": n/a"); continue; }
          parts.push(key + ": " + Math.round(item.remainingPercent) + "% left");
        }
        els.usageOverviewMeta.textContent = parts.join(" · ");
      }
    }

    function summarizeCodexUsage(profiles, usageByName) {
      if (!profiles || !profiles.length) {
        return { disconnected: true, message: "No Codex profiles connected." };
      }
      // Prefer default profile, else first with usage, else first profile.
      const preferred = profiles.find((p) => p.isDefault) || profiles[0];
      const names = [preferred.name].concat(profiles.map((p) => p.name).filter((n) => n !== preferred.name));
      let chosen = null;
      let usage = null;
      for (const name of names) {
        if (usageByName && usageByName[name] && !usageByName[name].error) {
          chosen = name;
          usage = usageByName[name];
          break;
        }
      }
      if (!usage) {
        const firstErr = names.map((n) => usageByName && usageByName[n]).find(Boolean);
        if (firstErr && firstErr.error) return { error: firstErr.error };
        return { loading: true };
      }
      const bars = [];
      if (usage.primaryWindow) bars.push({ label: "5h window", remainingPercent: usage.primaryWindow.remainingPercent });
      if (usage.secondaryWindow) bars.push({ label: "Weekly", remainingPercent: usage.secondaryWindow.remainingPercent });
      const remValues = bars.map((b) => b.remainingPercent).filter((v) => v != null && Number.isFinite(Number(v)));
      const remaining = remValues.length ? Math.min(...remValues.map(Number)) : null;
      return {
        remainingPercent: remaining,
        subtitle: chosen || preferred.name,
        detail: usage.planType ? ("plan " + usage.planType) : "",
        bars,
      };
    }

    function summarizeClineUsage(profiles, usageByName) {
      if (!profiles || !profiles.length) {
        return { disconnected: true, message: "No Cline profiles connected." };
      }
      const preferred = profiles.find((p) => p.isDefault) || profiles[0];
      const names = [preferred.name].concat(profiles.map((p) => p.name).filter((n) => n !== preferred.name));
      let chosen = null;
      let usage = null;
      for (const name of names) {
        if (usageByName && usageByName[name] && !usageByName[name].error) {
          chosen = name;
          usage = usageByName[name];
          break;
        }
      }
      if (!usage) {
        const firstErr = names.map((n) => usageByName && usageByName[n]).find(Boolean);
        if (firstErr && firstErr.error) return { error: firstErr.error };
        return { loading: true };
      }
      const limits = Array.isArray(usage.limits) ? usage.limits : [];
      const bars = limits.map((limit) => ({
        label: limit.label || limit.type || "limit",
        remainingPercent: limit.remainingPercent,
      }));
      const remValues = bars.map((b) => b.remainingPercent).filter((v) => v != null && Number.isFinite(Number(v)));
      const remaining = remValues.length ? Math.min(...remValues.map(Number)) : null;
      return {
        remainingPercent: remaining,
        subtitle: chosen || preferred.name,
        detail: bars.length ? (bars.length + " limit window" + (bars.length === 1 ? "" : "s")) : "",
        bars,
      };
    }

    function summarizeGrokUsage(status, usagePayload) {
      if (!status || !status.connected) {
        return { disconnected: true, message: "No Grok session. Run grok login." };
      }
      if (!usagePayload) return { loading: true };
      if (usagePayload.error) return { error: usagePayload.error };
      const usage = usagePayload.usage || usagePayload;
      const bars = (usage.products || []).map((product) => ({
        label: product.product || "Product",
        remainingPercent: product.remainingPercent,
      }));
      return {
        remainingPercent: usage.remainingPercent,
        subtitle: (status.session && (status.session.email || status.session.userId)) || "session",
        detail: usage.periodEnd ? ("resets " + new Date(usage.periodEnd).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : (usage.periodType || ""),
        bars: bars.length ? bars : [{ label: "Credits", remainingPercent: usage.remainingPercent }],
      };
    }

    async function loadOverviewUsage() {
      if (!els.usageOverview) return;
      state.overviewUsage = {
        codex: { loading: true },
        cline: { loading: true },
        grok: { loading: true },
        loading: true,
      };
      renderOverviewUsage();

      // Codex
      (async () => {
        try {
          const listRes = await fetch("/api/codex-auths").then(parseJson);
          const profiles = listRes.profiles || [];
          if (!profiles.length) {
            state.overviewUsage.codex = { disconnected: true, message: "No Codex profiles connected." };
            renderOverviewUsage();
            return;
          }
          const preferred = profiles.find((p) => p.isDefault) || profiles[0];
          const usage = await fetch("/api/codex-auths/" + encodeURIComponent(preferred.name) + "/usage").then(parseJson).catch((e) => ({ error: String(e && e.message || e) }));
          // if preferred fails, try others lightly
          let usageByName = {};
          if (usage && !usage.error) usageByName[preferred.name] = usage;
          else {
            for (const profile of profiles.slice(0, 3)) {
              const u = await fetch("/api/codex-auths/" + encodeURIComponent(profile.name) + "/usage").then(parseJson).catch((e) => ({ error: String(e && e.message || e) }));
              usageByName[profile.name] = u;
              if (!u.error) break;
            }
          }
          state.overviewUsage.codex = summarizeCodexUsage(profiles, usageByName);
        } catch (error) {
          state.overviewUsage.codex = { error: String(error && error.message || error) };
        }
        renderOverviewUsage();
      })();

      // Cline
      (async () => {
        try {
          const listRes = await fetch("/api/cline-auths").then(parseJson);
          const profiles = listRes.profiles || [];
          if (!profiles.length) {
            state.overviewUsage.cline = { disconnected: true, message: "No Cline profiles connected." };
            renderOverviewUsage();
            return;
          }
          const preferred = profiles.find((p) => p.isDefault) || profiles[0];
          let usageByName = {};
          for (const profile of [preferred, ...profiles.filter((p) => p.name !== preferred.name)].slice(0, 3)) {
            const u = await fetch("/api/cline-auths/" + encodeURIComponent(profile.name) + "/usage").then(parseJson).catch((e) => ({ error: String(e && e.message || e) }));
            usageByName[profile.name] = u;
            if (!u.error) break;
          }
          state.overviewUsage.cline = summarizeClineUsage(profiles, usageByName);
        } catch (error) {
          state.overviewUsage.cline = { error: String(error && error.message || error) };
        }
        renderOverviewUsage();
      })();

      // Grok
      (async () => {
        try {
          const status = await fetch("/api/grok-auth").then(parseJson);
          if (!status.connected) {
            state.overviewUsage.grok = { disconnected: true, message: status.message || "No Grok session. Run grok login." };
            renderOverviewUsage();
            return;
          }
          const usage = await fetch("/api/grok-auth/usage").then(parseJson).catch((e) => ({ error: String(e && e.message || e) }));
          state.overviewUsage.grok = summarizeGrokUsage(status, usage);
        } catch (error) {
          state.overviewUsage.grok = { error: String(error && error.message || error) };
        }
        renderOverviewUsage();
      })();
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

    function pickerLabel(model) {
      if (!model) return "—";
      if (model.pickerDisplayName) return model.pickerDisplayName;
      const providerName = model.providerDisplayName || model.providerId || "";
      const displayName = model.displayName || model.slug || "Model";
      if (!providerName) return displayName;
      if (String(displayName).toLowerCase().startsWith(String(providerName).toLowerCase() + ":")) return displayName;
      return providerName + ": " + displayName;
    }

    function effortLabel(value) {
      const raw = String(value || "").trim();
      if (!raw) return "—";
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    function modelEfforts(model) {
      const levels = Array.isArray(model && model.supportedReasoningLevels) ? model.supportedReasoningLevels : [];
      const efforts = levels.map((item) => String((item && (item.effort || item.value || item.id)) || "").trim()).filter(Boolean);
      if (efforts.length) return efforts;
      if (model && model.reasoningLevel) return [String(model.reasoningLevel)];
      return ["medium"];
    }

    function filteredModels() {
      const filterText = els.search.value.trim().toLowerCase();
      const provider = els.providerFilter.value;
      const modality = els.modalityFilter.value;
      return state.models.filter((model) => {
        if (provider && model.providerId !== provider) return false;
        if (modality === "image" && !(model.inputModalities || []).includes("image")) return false;
        if (modality === "text" && (model.inputModalities || []).includes("image")) return false;
        if (!filterText) return true;
        const haystack = [pickerLabel(model), model.slug, model.displayName, model.upstreamModel, model.providerId, model.providerDisplayName]
          .filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(filterText);
      });
    }

    function ensureSelection(filtered) {
      if (!filtered.length) {
        state.selectedSlug = "";
        state.selectedEffort = "";
        return null;
      }
      let selected = filtered.find((model) => model.slug === state.selectedSlug) || filtered[0];
      state.selectedSlug = selected.slug;
      const efforts = modelEfforts(selected);
      if (!efforts.includes(state.selectedEffort)) {
        state.selectedEffort = selected.reasoningLevel && efforts.includes(String(selected.reasoningLevel))
          ? String(selected.reasoningLevel)
          : efforts[0];
      }
      return selected;
    }

    function renderPicker(filtered, selected) {
      if (!els.pickerList) return;
      if (!filtered.length) {
        els.pickerList.innerHTML = '<div class="empty">No models match the current filters.</div>';
        if (els.pickerSelectedLabel) els.pickerSelectedLabel.textContent = "—";
        if (els.pickerSelectedEffort) els.pickerSelectedEffort.textContent = "—";
        if (els.pickerDetails) els.pickerDetails.innerHTML = '<div class="empty">No models match the current filters.</div>';
        return;
      }

      if (els.pickerSelectedLabel) els.pickerSelectedLabel.textContent = pickerLabel(selected);
      if (els.pickerSelectedEffort) els.pickerSelectedEffort.textContent = effortLabel(state.selectedEffort);

      els.pickerList.innerHTML = filtered.map((model) => {
        const active = model.slug === state.selectedSlug ? " active" : "";
        return '<button type="button" class="picker-item' + active + '" data-slug="' + escapeHtml(model.slug) + '">' +
          '<span class="name">' + escapeHtml(pickerLabel(model)) + '</span>' +
          '<span class="meta">' + escapeHtml(fmtContext(model.contextWindow)) + '</span>' +
        '</button>';
      }).join("");

      els.pickerList.querySelectorAll("button[data-slug]").forEach((button) => {
        button.addEventListener("click", () => {
          state.selectedSlug = button.getAttribute("data-slug") || "";
          state.selectedEffort = "";
          renderModels();
        });
      });

      const modalities = (selected.inputModalities || ["text"]).map((m) => '<span class="badge ' + escapeHtml(m) + '">' + escapeHtml(m) + '</span>').join(" ");
      const efforts = modelEfforts(selected);
      const effortChips = efforts.map((effort) => {
        const active = effort === state.selectedEffort ? " active" : "";
        return '<button type="button" class="effort-chip' + active + '" data-effort="' + escapeHtml(effort) + '">' + escapeHtml(effortLabel(effort)) + '</button>';
      }).join("");

      if (els.pickerDetails) {
        els.pickerDetails.innerHTML =
          '<h3>' + escapeHtml(pickerLabel(selected)) + '</h3>' +
          '<div class="sub">Exactly how this model is labeled in the Codex Desktop picker.</div>' +
          '<div class="picker-kv">' +
            '<div class="k">Slug</div><div class="v"><code>' + escapeHtml(selected.slug || "—") + '</code></div>' +
            '<div class="k">Provider</div><div class="v"><span class="badge provider" style="' + providerBadgeStyle(selected.providerId) + '">' + escapeHtml(providerLabel(selected)) + '</span></div>' +
            '<div class="k">Upstream</div><div class="v"><code>' + escapeHtml(selected.upstreamModel || "—") + '</code></div>' +
            '<div class="k">Input</div><div class="v">' + modalities + '</div>' +
            '<div class="k">Context</div><div class="v">' + escapeHtml(fmtContext(selected.contextWindow)) + '</div>' +
            '<div class="k">Default effort</div><div class="v">' + escapeHtml(effortLabel(selected.reasoningLevel || state.selectedEffort)) + '</div>' +
          '</div>' +
          '<div class="picker-effort-row">' + effortChips + '</div>';

        els.pickerDetails.querySelectorAll("button[data-effort]").forEach((button) => {
          button.addEventListener("click", () => {
            state.selectedEffort = button.getAttribute("data-effort") || "";
            renderModels();
          });
        });
      }
    }

    function renderModels() {
      const providers = new Set(state.models.map((m) => m.providerId));
      const current = els.providerFilter.value;
      els.providerFilter.innerHTML = '<option value="">All providers</option>' +
        Array.from(providers).sort().map((p) => '<option value="' + escapeHtml(p) + '" style="color:' + escapeHtml(providerColor(p)) + '"' + (p === current ? ' selected' : '') + '>' + escapeHtml(p) + '</option>').join("");

      const filtered = filteredModels();
      const selected = ensureSelection(filtered);
      els.modelCount.textContent = String(filtered.length);
      renderPicker(filtered, selected);
    }

    async function parseJson(response) {
      const text = await response.text();
      if (!text) return {};
      try { return JSON.parse(text); } catch { return { error: "Invalid JSON response", raw: text.slice(0, 200) }; }
    }



    function highlightYaml(source) {
      const text = String(source == null ? "" : source);
      if (!text) return "\\n";
      const lines = text.split("\\n");
      return lines.map((line) => highlightYamlLine(line)).join("\\n") + (text.endsWith("\\n") ? "\\n" : "");
    }

    function highlightYamlLine(line) {
      if (!line) return "";
      let i = 0;
      let out = "";
      const len = line.length;

      while (i < len && (line[i] === " " || line[i] === "\\t")) {
        out += escapeHtml(line[i]);
        i += 1;
      }
      if (i >= len) return out;

      if (line[i] === "#") {
        return out + '<span class="tok-comment">' + escapeHtml(line.slice(i)) + '</span>';
      }

      if (line[i] === "-" && (i + 1 >= len || line[i + 1] === " ")) {
        out += '<span class="tok-list">-</span>';
        i += 1;
        while (i < len && line[i] === " ") {
          out += " ";
          i += 1;
        }
      }

      if (i >= len) return out;

      const rest = line.slice(i);
      const keyMatch = rest.match(/^([^:#\\n]+?)(:)(\\s+|$)/);
      if (keyMatch && !rest.startsWith("http") && !rest.startsWith("\\"") && !rest.startsWith("'")) {
        const key = keyMatch[1];
        const colon = keyMatch[2];
        const spaces = keyMatch[3] || "";
        out += '<span class="tok-key">' + escapeHtml(key) + '</span>';
        out += '<span class="tok-punct">' + escapeHtml(colon) + '</span>';
        out += escapeHtml(spaces);
        i += key.length + colon.length + spaces.length;
      }

      if (i >= len) return out;
      out += highlightYamlValue(line.slice(i));
      return out;
    }

    function highlightYamlValue(value) {
      const raw = String(value || "");
      if (!raw) return "";
      let i = 0;
      let out = "";
      const len = raw.length;
      while (i < len && raw[i] === " ") {
        out += " ";
        i += 1;
      }
      if (i >= len) return out;

      if (raw[i] === "#") {
        return out + '<span class="tok-comment">' + escapeHtml(raw.slice(i)) + '</span>';
      }

      if (raw[i] === '"' || raw[i] === "'") {
        const quote = raw[i];
        let j = i + 1;
        let escaped = false;
        while (j < len) {
          const ch = raw[j];
          if (escaped) { escaped = false; j += 1; continue; }
          if (ch === "\\\\") { escaped = true; j += 1; continue; }
          if (ch === quote) { j += 1; break; }
          j += 1;
        }
        const body = raw.slice(i, j);
        const trailing = raw.slice(j);
        out += '<span class="tok-string">' + highlightEnvInText(body) + '</span>';
        if (trailing.trimStart().startsWith("#")) {
          const ws = trailing.match(/^\\s*/)[0];
          out += escapeHtml(ws) + '<span class="tok-comment">' + escapeHtml(trailing.slice(ws.length)) + '</span>';
        } else if (trailing) {
          out += escapeHtml(trailing);
        }
        return out;
      }

      let commentAt = -1;
      let inSingle = false;
      let inDouble = false;
      for (let j = i; j < len; j += 1) {
        const ch = raw[j];
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        if (ch === '"' && !inSingle) inDouble = !inDouble;
        if (!inSingle && !inDouble && ch === "#") { commentAt = j; break; }
      }
      const main = commentAt >= 0 ? raw.slice(i, commentAt) : raw.slice(i);
      const comment = commentAt >= 0 ? raw.slice(commentAt) : "";
      const trimmed = main.trim();
      if (/^(true|false)$/i.test(trimmed)) {
        out += '<span class="tok-bool">' + escapeHtml(main) + '</span>';
      } else if (/^(null|~)$/i.test(trimmed)) {
        out += '<span class="tok-null">' + escapeHtml(main) + '</span>';
      } else if (/^-?\\d+(\\.\\d+)?$/.test(trimmed)) {
        out += '<span class="tok-number">' + escapeHtml(main) + '</span>';
      } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        out += highlightYamlFlowList(main);
      } else if (trimmed.includes("$" + "{")) {
        out += highlightEnvInText(main);
      } else {
        out += '<span class="tok-plain">' + escapeHtml(main) + '</span>';
      }
      if (comment) out += '<span class="tok-comment">' + escapeHtml(comment) + '</span>';
      return out;
    }

    function highlightYamlFlowList(text) {
      let out = "";
      let i = 0;
      const raw = String(text);
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "[" || ch === "]" || ch === ",") {
          out += '<span class="tok-punct">' + escapeHtml(ch) + '</span>';
          i += 1;
          continue;
        }
        if (ch === " " || ch === "\\t") {
          out += ch;
          i += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          const quote = ch;
          let j = i + 1;
          let escaped = false;
          while (j < raw.length) {
            const c = raw[j];
            if (escaped) { escaped = false; j += 1; continue; }
            if (c === "\\\\") { escaped = true; j += 1; continue; }
            if (c === quote) { j += 1; break; }
            j += 1;
          }
          out += '<span class="tok-string">' + highlightEnvInText(raw.slice(i, j)) + '</span>';
          i = j;
          continue;
        }
        let j = i;
        while (j < raw.length && !"[], \\t".includes(raw[j])) j += 1;
        const token = raw.slice(i, j);
        if (/^(true|false)$/i.test(token)) out += '<span class="tok-bool">' + escapeHtml(token) + '</span>';
        else if (/^-?\\d+(\\.\\d+)?$/.test(token)) out += '<span class="tok-number">' + escapeHtml(token) + '</span>';
        else if (token.includes("$" + "{")) out += highlightEnvInText(token);
        else out += '<span class="tok-plain">' + escapeHtml(token) + '</span>';
        i = j;
      }
      return out;
    }

    function highlightEnvInText(text) {
      const raw = String(text);
      const parts = [];
      let last = 0;
      const re = /\\$\\{[A-Za-z_][A-Za-z0-9_]*\\}/g;
      let match;
      while ((match = re.exec(raw))) {
        if (match.index > last) parts.push(escapeHtml(raw.slice(last, match.index)));
        parts.push('<span class="tok-env">' + escapeHtml(match[0]) + '</span>');
        last = match.index + match[0].length;
      }
      if (last < raw.length) parts.push(escapeHtml(raw.slice(last)));
      return parts.join("");
    }

    function renderConfigHighlight() {
      if (!els.configEditor || !els.configHighlightCode) return;
      const value = els.configEditor.value;
      els.configHighlightCode.innerHTML = highlightYaml(value) || "\\n";
      syncConfigScroll();
    }

    function syncConfigScroll() {
      if (!els.configEditor || !els.configHighlight) return;
      els.configHighlight.scrollTop = els.configEditor.scrollTop;
      els.configHighlight.scrollLeft = els.configEditor.scrollLeft;
    }

    function syncConfigEditorHeight() {
      if (!els.configEditor || !els.configEditorShell || !els.configHighlight) return;
      const height = Math.max(520, els.configEditor.offsetHeight || 520);
      els.configEditorShell.style.minHeight = height + "px";
      els.configHighlight.style.height = height + "px";
    }

    function renderEnvHighlight() {
      if (!els.envEditor || !els.envHighlightCode) return;
      els.envHighlightCode.innerHTML = highlightEnvFile(els.envEditor.value) || "\\n";
      syncEnvScroll();
    }

    function syncEnvScroll() {
      if (!els.envEditor || !els.envHighlight) return;
      els.envHighlight.scrollTop = els.envEditor.scrollTop;
      els.envHighlight.scrollLeft = els.envEditor.scrollLeft;
    }

    function syncEnvEditorHeight() {
      if (!els.envEditor || !els.envEditorShell || !els.envHighlight) return;
      const height = Math.max(520, els.envEditor.offsetHeight || 520);
      els.envEditorShell.style.minHeight = height + "px";
      els.envHighlight.style.height = height + "px";
    }

    function highlightEnvFile(source) {
      const text = String(source == null ? "" : source);
      if (!text) return "\\n";
      return text.split("\\n").map((line) => highlightEnvLine(line)).join("\\n") + (text.endsWith("\\n") ? "\\n" : "");
    }

    function highlightEnvLine(line) {
      if (!line) return "";
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("#")) {
        return '<span class="tok-comment">' + escapeHtml(line) + '</span>';
      }
      let working = line;
      let prefix = "";
      if (working.trimStart().startsWith("export ")) {
        const idx = working.indexOf("export ");
        prefix = escapeHtml(working.slice(0, idx)) + '<span class="tok-punct">export</span> ';
        working = working.slice(idx + "export ".length);
      }
      const eq = working.indexOf("=");
      if (eq <= 0) {
        return '<span class="tok-plain">' + escapeHtml(line) + '</span>';
      }
      const key = working.slice(0, eq);
      const value = working.slice(eq + 1);
      return prefix +
        '<span class="tok-key">' + escapeHtml(key) + '</span>' +
        '<span class="tok-punct">=</span>' +
        highlightEnvValue(value);
    }

    function highlightEnvValue(value) {
      const raw = String(value || "");
      if (!raw) return "";
      // preserve leading spaces after =
      let i = 0;
      while (i < raw.length && raw[i] === " ") i += 1;
      const lead = escapeHtml(raw.slice(0, i));
      const body = raw.slice(i);
      if (!body) return lead;
      if (body[0] === "#" ) return lead + '<span class="tok-comment">' + escapeHtml(body) + '</span>';
      if (body[0] === '"' || body[0] === "'") {
        // quoted value + optional comment
        const quote = body[0];
        let j = 1;
        let escaped = false;
        while (j < body.length) {
          const ch = body[j];
          if (escaped) { escaped = false; j += 1; continue; }
          if (ch === "\\\\") { escaped = true; j += 1; continue; }
          if (ch === quote) { j += 1; break; }
          j += 1;
        }
        const quoted = body.slice(0, j);
        const rest = body.slice(j);
        let out = lead + '<span class="tok-string">' + escapeHtml(quoted) + '</span>';
        if (rest.trimStart().startsWith("#")) {
          const ws = rest.match(/^\\s*/)[0];
          out += escapeHtml(ws) + '<span class="tok-comment">' + escapeHtml(rest.slice(ws.length)) + '</span>';
        } else if (rest) {
          out += escapeHtml(rest);
        }
        return out;
      }
      const commentMatch = body.match(/^(.*?)(\\s+#.*)$/);
      if (commentMatch) {
        const main = commentMatch[1];
        const comment = commentMatch[2];
        const cls = /^(true|false)$/i.test(main.trim()) ? "tok-bool" : (/^-?\\d+(\\.\\d+)?$/.test(main.trim()) ? "tok-number" : "tok-string");
        return lead + '<span class="' + cls + '">' + escapeHtml(main) + '</span><span class="tok-comment">' + escapeHtml(comment) + '</span>';
      }
      const cls = /^(true|false)$/i.test(body.trim()) ? "tok-bool" : (/^-?\\d+(\\.\\d+)?$/.test(body.trim()) ? "tok-number" : "tok-string");
      return lead + '<span class="' + cls + '">' + escapeHtml(body) + '</span>';
    }

    function setEnvStatus(message, kind) {
      if (!els.envStatus) return;
      els.envStatus.textContent = message || "";
      els.envStatus.className = "config-status" + (kind ? (" " + kind) : "");
    }

    function parseEnvEntries(text) {
      const entries = [];
      const lines = String(text || "").split("\\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        let working = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
        const eq = working.indexOf("=");
        if (eq <= 0) continue;
        const key = working.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = working.slice(eq + 1).trim();
        // strip unquoted inline comment
        if (value && value[0] !== '"' && value[0] !== "'") {
          const commentAt = value.search(/\\s#/);
          if (commentAt >= 0) value = value.slice(0, commentAt).trim();
        }
        // unquote simple quoted values for plane editing
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        entries.push({ key, value, id: key + "::" + entries.length });
      }
      return entries;
    }

    function serializeEnvEntries(entries) {
      const lines = [];
      for (const entry of entries || []) {
        const key = String(entry.key || "").trim();
        if (!key) continue;
        const value = String(entry.value == null ? "" : entry.value);
        lines.push(key + "=" + escapeEnvValue(value));
      }
      return lines.length ? (lines.join("\\n") + "\\n") : "";
    }

    function escapeEnvValue(value) {
      const raw = String(value == null ? "" : value);
      if (raw === "") return "";
      if (/[\\s#"'\\\\]/.test(raw) || raw.includes("\\n") || raw.includes("\\r")) {
        return '"' + raw
          .replaceAll("\\\\", "\\\\\\\\")
          .replaceAll('"', '\\\\"')
          .replaceAll("\\n", "\\\\n")
          .replaceAll("\\r", "\\\\r")
          .replaceAll("\\t", "\\\\t") + '"';
      }
      return raw;
    }

    function maskSecret(value) {
      const raw = String(value == null ? "" : value);
      if (!raw) return "";
      if (raw.length <= 4) return "•".repeat(Math.max(raw.length, 4));
      return "•".repeat(Math.min(28, Math.max(8, raw.length)));
    }

    function syncEnvTextFromEntries() {
      state.envEntries = (state.envEntries || []).map((entry, index) => ({
        id: entry.id || (String(entry.key || "key") + "::" + index),
        key: String(entry.key || ""),
        value: String(entry.value == null ? "" : entry.value),
      }));
      state.envText = serializeEnvEntries(state.envEntries);
      if (els.envEditor && !state.envSyncingRaw) {
        state.envSyncingRaw = true;
        els.envEditor.value = state.envText;
        renderEnvHighlight();
        state.envSyncingRaw = false;
      }
      markEnvDirty();
    }

    function markEnvDirty() {
      const current = serializeEnvEntries(state.envEntries);
      state.envDirty = current !== state.envOriginal;
      state.envText = current;
      if (els.envEditorShell) els.envEditorShell.classList.toggle("dirty", state.envDirty);
      if (els.envMeta) {
        const bits = [];
        bits.push((state.envEntries || []).length + " vars");
        if (state.envPath) bits.push(state.envPath);
        bits.push(state.envDirty ? "unsaved changes" : "saved");
        bits.push("values hidden by default");
        els.envMeta.textContent = bits.join(" · ");
      }
    }

    function setEnvBusy(busy) {
      state.envBusy = Boolean(busy);
      for (const button of [els.envReload, els.envValidate, els.envSave, els.envSaveRestart, els.envAdd, els.envHideAll, els.envApplyRaw]) {
        if (button) button.disabled = state.envBusy;
      }
      if (els.envEditor) els.envEditor.disabled = state.envBusy;
      if (els.envRows) {
        els.envRows.querySelectorAll("input,button").forEach((node) => {
          if (node.id === "env-add") return;
          node.disabled = state.envBusy;
        });
      }
    }

    function renderEnvPlane() {
      if (!els.envRows) return;
      const entries = state.envEntries || [];
      if (!entries.length) {
        els.envRows.innerHTML = '<div class="env-empty">No environment variables yet. Add one to get started.</div>';
        return;
      }
      els.envRows.innerHTML = entries.map((entry) => {
        const revealed = !!state.envRevealed[entry.id];
        const valueAttr = revealed ? escapeHtml(entry.value) : escapeHtml(maskSecret(entry.value));
        const inputType = revealed ? "text" : "password";
        // When hidden, keep input readonly-looking by using password type with real value for editability.
        // Use real value always in DOM value so edits work; password type masks it.
        return '<div class="env-row" data-id="' + escapeHtml(entry.id) + '">' +
          '<input class="env-key" data-field="key" type="text" spellcheck="false" autocomplete="off" placeholder="NAME" value="' + escapeHtml(entry.key) + '" />' +
          '<div class="env-value-wrap">' +
            '<input class="env-value" data-field="value" type="' + inputType + '" spellcheck="false" autocomplete="new-password" placeholder="value" value="' + escapeHtml(entry.value) + '" />' +
          '</div>' +
          '<div class="env-row-actions">' +
            '<button type="button" class="ghost" data-action="toggle">' + (revealed ? "Hide" : "Reveal") + '</button>' +
            '<button type="button" class="ghost danger" data-action="remove">Remove</button>' +
          '</div>' +
        '</div>';
      }).join("");

      els.envRows.querySelectorAll(".env-row").forEach((row) => {
        const id = row.getAttribute("data-id");
        const entry = (state.envEntries || []).find((item) => item.id === id);
        if (!entry) return;
        const keyInput = row.querySelector('input[data-field="key"]');
        const valueInput = row.querySelector('input[data-field="value"]');
        if (keyInput) {
          keyInput.addEventListener("input", () => {
            entry.key = keyInput.value;
            syncEnvTextFromEntries();
            setEnvStatus("Unsaved changes", "warn");
          });
        }
        if (valueInput) {
          valueInput.addEventListener("input", () => {
            entry.value = valueInput.value;
            syncEnvTextFromEntries();
            setEnvStatus("Unsaved changes", "warn");
          });
          valueInput.addEventListener("focus", () => {
            // auto-reveal while editing
            if (!state.envRevealed[id]) {
              state.envRevealed[id] = true;
              valueInput.type = "text";
              const toggle = row.querySelector('button[data-action="toggle"]');
              if (toggle) toggle.textContent = "Hide";
            }
          });
        }
        const toggle = row.querySelector('button[data-action="toggle"]');
        if (toggle) {
          toggle.addEventListener("click", () => {
            state.envRevealed[id] = !state.envRevealed[id];
            renderEnvPlane();
          });
        }
        const remove = row.querySelector('button[data-action="remove"]');
        if (remove) {
          remove.addEventListener("click", () => {
            state.envEntries = (state.envEntries || []).filter((item) => item.id !== id);
            delete state.envRevealed[id];
            syncEnvTextFromEntries();
            renderEnvPlane();
            setEnvStatus("Unsaved changes", "warn");
          });
        }
      });
    }

    function addEnvEntry(prefill = {}) {
      const id = "new::" + Date.now() + "::" + Math.random().toString(16).slice(2, 8);
      state.envEntries = state.envEntries || [];
      state.envEntries.push({
        id,
        key: String(prefill.key || ""),
        value: String(prefill.value || ""),
      });
      state.envRevealed[id] = true;
      syncEnvTextFromEntries();
      renderEnvPlane();
      setEnvStatus("Unsaved changes", "warn");
      // focus new key
      const row = els.envRows && els.envRows.querySelector('.env-row[data-id="' + id + '"] input[data-field="key"]');
      if (row) row.focus();
    }

    function hideAllEnvValues() {
      state.envRevealed = {};
      renderEnvPlane();
      setEnvStatus("Values hidden", "ok");
    }

    function applyRawEnvToPlane() {
      if (!els.envEditor) return;
      const text = els.envEditor.value;
      // lightweight client validation
      try {
        const entries = parseEnvEntries(text);
        const seen = new Set();
        for (const entry of entries) {
          if (!entry.key) continue;
          if (seen.has(entry.key)) throw new Error("Duplicate env key: " + entry.key);
          seen.add(entry.key);
        }
        state.envEntries = entries;
        state.envRevealed = {};
        syncEnvTextFromEntries();
        renderEnvPlane();
        setEnvStatus("Raw .env applied to secret plane (" + entries.length + " vars).", "ok");
      } catch (error) {
        setEnvStatus("Could not apply raw .env: " + String(error && error.message || error), "err");
        toast("Raw env invalid", String(error && error.message || error), "err");
      }
    }

    function setConfigTab(tab) {
      state.configTab = tab === "env" ? "env" : "yml";
      if (els.configTabYml) els.configTabYml.classList.toggle("active", state.configTab === "yml");
      if (els.configTabEnv) els.configTabEnv.classList.toggle("active", state.configTab === "env");
      if (els.configPaneYml) els.configPaneYml.classList.toggle("active", state.configTab === "yml");
      if (els.configPaneEnv) els.configPaneEnv.classList.toggle("active", state.configTab === "env");
      if (els.configActiveLabel) {
        els.configActiveLabel.textContent = state.configTab === "env" ? ".env secrets" : "shimex.yml";
      }
      if (state.configTab === "env") {
        if (!state.envLoaded && !state.envBusy) loadEnv();
        else {
          renderEnvPlane();
          renderEnvHighlight();
          syncEnvEditorHeight();
        }
      } else {
        renderConfigHighlight();
        syncConfigEditorHeight();
      }
    }

    async function loadEnv() {
      if (!els.envRows && !els.envEditor) return;
      setEnvBusy(true);
      setEnvStatus("Loading .env…");
      try {
        const response = await fetch("/api/env");
        const result = await parseJson(response);
        if (!response.ok) {
          throw new Error((result && result.error && (result.error.message || result.error)) || ("HTTP " + response.status));
        }
        state.envText = String(result.text || "");
        state.envOriginal = state.envText;
        state.envPath = String(result.path || ".env");
        state.envMtime = String(result.mtime || "");
        state.envLoaded = true;
        state.envEntries = parseEnvEntries(state.envText);
        state.envRevealed = {};
        if (els.envEditor) {
          state.envSyncingRaw = true;
          els.envEditor.value = state.envText;
          renderEnvHighlight();
          state.envSyncingRaw = false;
        }
        if (els.envPath) {
          els.envPath.textContent = "path: " + state.envPath + (result.exists === false ? " (new file)" : "");
        }
        renderEnvPlane();
        markEnvDirty();
        const count = state.envEntries.length;
        setEnvStatus("Loaded " + count + " env vars. Values stay hidden until revealed.", "ok");
      } catch (error) {
        setEnvStatus("Could not load .env: " + String(error && error.message || error), "err");
      } finally {
        setEnvBusy(false);
      }
    }

    async function validateEnv() {
      // validate current plane serialization (or raw if advanced focused)
      const text = serializeEnvEntries(state.envEntries);
      setEnvBusy(true);
      setEnvStatus("Validating…");
      try {
        const response = await fetch("/api/env/validate", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ text }),
        });
        const result = await parseJson(response);
        if (!response.ok || (result && result.ok === false)) {
          throw new Error((result && result.error) || ("HTTP " + response.status));
        }
        setEnvStatus("Valid .env with " + String(result.keyCount || 0) + " keys.", "ok");
        toast("Env valid", String(result.keyCount || 0) + " keys", "ok");
        return true;
      } catch (error) {
        setEnvStatus("Validation failed: " + String(error && error.message || error), "err");
        toast("Env invalid", String(error && error.message || error), "err");
        return false;
      } finally {
        setEnvBusy(false);
      }
    }

    async function saveEnv({ restart = false } = {}) {
      setEnvBusy(true);
      setEnvStatus(restart ? "Saving and restarting…" : "Saving…");
      try {
        // ensure no blank keys
        for (const entry of state.envEntries || []) {
          if (String(entry.value || "") && !String(entry.key || "").trim()) {
            throw new Error("Every value needs a key name.");
          }
          const key = String(entry.key || "").trim();
          if (key && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error("Invalid key: " + key);
          }
        }
        const text = serializeEnvEntries(state.envEntries);
        const response = await fetch("/api/env", {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ text }),
        });
        const result = await parseJson(response);
        if (!response.ok) {
          throw new Error((result && result.error) || ("HTTP " + response.status));
        }
        state.envText = text;
        state.envOriginal = text;
        state.envPath = String(result.path || state.envPath || ".env");
        state.envMtime = String(result.mtime || state.envMtime || "");
        if (els.envPath) els.envPath.textContent = "path: " + state.envPath;
        if (els.envEditor) {
          state.envSyncingRaw = true;
          els.envEditor.value = text;
          renderEnvHighlight();
          state.envSyncingRaw = false;
        }
        // keep values hidden after save
        state.envRevealed = {};
        renderEnvPlane();
        markEnvDirty();
        setEnvStatus((result.message || "Saved.") + (restart ? " Restarting host…" : ""), "ok");
        toast("Env saved", result.path || ".env", "ok");
        if (restart) {
          const restartResponse = await fetch("/api/host/restart", {
            method: "POST",
            headers: { accept: "application/json" },
          });
          const restartResult = await parseJson(restartResponse);
          if (!restartResponse.ok) {
            throw new Error((restartResult && restartResult.error && (restartResult.error.message || restartResult.error)) || ("HTTP " + restartResponse.status));
          }
          setEnvStatus("Saved. Host restart requested — reload this page in a few seconds.", "warn");
          toast("Host restarting", "Reload admin after a few seconds", "warn");
        }
        return true;
      } catch (error) {
        setEnvStatus("Save failed: " + String(error && error.message || error), "err");
        toast("Env save failed", String(error && error.message || error), "err");
        return false;
      } finally {
        setEnvBusy(false);
      }
    }

    function setConfigStatus(message, kind) {
      if (!els.configStatus) return;
      els.configStatus.textContent = message || "";
      els.configStatus.className = "config-status" + (kind ? (" " + kind) : "");
    }

    function markConfigDirty() {
      if (!els.configEditor) return;
      state.configDirty = els.configEditor.value !== state.configOriginal;
      if (els.configEditorShell) els.configEditorShell.classList.toggle("dirty", state.configDirty);
      else els.configEditor.classList.toggle("dirty", state.configDirty);
      if (els.configMeta) {
        const bits = [];
        if (state.configPath) bits.push(state.configPath);
        if (state.configMtime) bits.push("mtime " + state.configMtime);
        bits.push(state.configDirty ? "unsaved changes" : "saved");
        els.configMeta.textContent = bits.filter(Boolean).join(" · ");
      }
    }

    function setConfigBusy(busy) {
      state.configBusy = Boolean(busy);
      for (const button of [els.configReload, els.configValidate, els.configSave, els.configSaveRestart]) {
        if (button) button.disabled = state.configBusy;
      }
      if (els.configEditor) els.configEditor.disabled = state.configBusy;
    }

    async function loadConfig() {
      if (!els.configEditor) return;
      setConfigBusy(true);
      setConfigStatus("Loading shimex.yml…");
      try {
        const response = await fetch("/api/config");
        const result = await parseJson(response);
        if (!response.ok) {
          throw new Error((result && result.error && (result.error.message || result.error)) || ("HTTP " + response.status));
        }
        state.configText = String(result.text || "");
        state.configOriginal = state.configText;
        state.configPath = String(result.path || "shimex.yml");
        state.configMtime = String(result.mtime || "");
        els.configEditor.value = state.configText;
        if (els.configPath) els.configPath.textContent = "path: " + state.configPath;
        renderConfigHighlight();
        syncConfigEditorHeight();
        markConfigDirty();
        setConfigStatus("Loaded. Edit, validate, then save. Restart applies changes.", "ok");
      } catch (error) {
        setConfigStatus("Could not load config: " + String(error && error.message || error), "err");
      } finally {
        setConfigBusy(false);
      }
    }

    async function validateConfig() {
      if (!els.configEditor) return false;
      setConfigBusy(true);
      setConfigStatus("Validating…");
      try {
        const response = await fetch("/api/config/validate", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ text: els.configEditor.value }),
        });
        const result = await parseJson(response);
        if (!response.ok || (result && result.ok === false)) {
          throw new Error((result && result.error) || ("HTTP " + response.status));
        }
        setConfigStatus("Valid YAML. " + String(result.enabledProviders || 0) + " enabled / " + String(result.providerCount || 0) + " providers.", "ok");
        toast("Config valid", (result.enabledProviders || 0) + " enabled providers", "ok");
        return true;
      } catch (error) {
        setConfigStatus("Validation failed: " + String(error && error.message || error), "err");
        toast("Config invalid", String(error && error.message || error), "err");
        return false;
      } finally {
        setConfigBusy(false);
      }
    }

    async function saveConfig({ restart = false } = {}) {
      if (!els.configEditor) return false;
      setConfigBusy(true);
      setConfigStatus(restart ? "Saving and restarting…" : "Saving…");
      try {
        const response = await fetch("/api/config", {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ text: els.configEditor.value }),
        });
        const result = await parseJson(response);
        if (!response.ok) {
          throw new Error((result && result.error) || ("HTTP " + response.status));
        }
        state.configOriginal = els.configEditor.value;
        state.configPath = String(result.path || state.configPath || "shimex.yml");
        state.configMtime = String(result.mtime || state.configMtime || "");
        if (els.configPath) els.configPath.textContent = "path: " + state.configPath;
        markConfigDirty();
        setConfigStatus((result.message || "Saved.") + (restart ? " Restarting host…" : ""), "ok");
        toast("Config saved", result.path || "shimex.yml", "ok");
        if (restart) {
          const restartResponse = await fetch("/api/host/restart", {
            method: "POST",
            headers: { accept: "application/json" },
          });
          const restartResult = await parseJson(restartResponse);
          if (!restartResponse.ok) {
            throw new Error((restartResult && restartResult.error && (restartResult.error.message || restartResult.error)) || ("HTTP " + restartResponse.status));
          }
          setConfigStatus("Saved. Host restart requested — reload this page in a few seconds.", "warn");
          toast("Host restarting", "Reload admin after a few seconds", "warn");
        }
        return true;
      } catch (error) {
        setConfigStatus("Save failed: " + String(error && error.message || error), "err");
        toast("Config save failed", String(error && error.message || error), "err");
        return false;
      } finally {
        setConfigBusy(false);
      }
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
        loadOverviewUsage();
      } catch (error) {
        setHealth(false, "offline");
        els.doctorMeta.textContent = "unreachable";
        els.doctorMeta.style.color = "var(--danger)";
        if (els.pickerList) els.pickerList.innerHTML = '<div class="empty">Could not reach the Shimex backend: ' + escapeHtml(String(error && error.message || error)) + '</div>';
        if (els.pickerDetails) els.pickerDetails.innerHTML = '<div class="empty">Backend unreachable.</div>';
      }
    }

    
    if (els.configTabYml) els.configTabYml.addEventListener("click", () => setConfigTab("yml"));
    if (els.configTabEnv) els.configTabEnv.addEventListener("click", () => setConfigTab("env"));

    if (els.configEditor) {
      els.configEditor.addEventListener("input", () => {
        state.configText = els.configEditor.value;
        renderConfigHighlight();
        markConfigDirty();
        if (state.configDirty) setConfigStatus("Unsaved changes", "warn");
      });
      els.configEditor.addEventListener("scroll", syncConfigScroll, { passive: true });
      els.configEditor.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveConfig({ restart: false });
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const start = els.configEditor.selectionStart;
          const end = els.configEditor.selectionEnd;
          const value = els.configEditor.value;
          els.configEditor.value = value.slice(0, start) + "  " + value.slice(end);
          els.configEditor.selectionStart = els.configEditor.selectionEnd = start + 2;
          state.configText = els.configEditor.value;
          renderConfigHighlight();
          markConfigDirty();
        }
      });
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => syncConfigEditorHeight());
        ro.observe(els.configEditor);
      } else {
        window.addEventListener("resize", syncConfigEditorHeight);
      }
      renderConfigHighlight();
      syncConfigEditorHeight();
    }
    if (els.configReload) els.configReload.addEventListener("click", () => loadConfig());
    if (els.configValidate) els.configValidate.addEventListener("click", () => validateConfig());
    if (els.configSave) els.configSave.addEventListener("click", () => saveConfig({ restart: false }));
    if (els.configSaveRestart) els.configSaveRestart.addEventListener("click", () => saveConfig({ restart: true }));

    if (els.envEditor) {
      els.envEditor.addEventListener("input", () => {
        if (state.envSyncingRaw) return;
        state.envText = els.envEditor.value;
        renderEnvHighlight();
      });
      els.envEditor.addEventListener("scroll", syncEnvScroll, { passive: true });
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => syncEnvEditorHeight());
        ro.observe(els.envEditor);
      }
    }
    if (els.envAdd) els.envAdd.addEventListener("click", () => addEnvEntry());
    if (els.envHideAll) els.envHideAll.addEventListener("click", () => hideAllEnvValues());
    if (els.envApplyRaw) els.envApplyRaw.addEventListener("click", () => applyRawEnvToPlane());
    if (els.envReload) els.envReload.addEventListener("click", () => loadEnv());
    if (els.envValidate) els.envValidate.addEventListener("click", () => validateEnv());
    if (els.envSave) els.envSave.addEventListener("click", () => saveEnv({ restart: false }));
    if (els.envSaveRestart) els.envSaveRestart.addEventListener("click", () => saveEnv({ restart: true }));

    els.search.addEventListener("input", renderModels);
    els.providerFilter.addEventListener("change", renderModels);
    els.modalityFilter.addEventListener("change", renderModels);
    document.querySelectorAll(".nav-item, .sidebar-brand[data-view]").forEach((item) => {
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
    ${cursorAuthsRuntimeHelpers()}
    ${clineAuthsRuntimeHelpers()}
    ${grokAuthsRuntimeHelpers()}
    ${pairingRuntimeHelpers()}
    ${providerConfigRuntimeHelpers()}
    els.refresh.addEventListener("click", () => load().then(() => toast("Refreshed", "Doctor and model list updated.", "ok")));
    initProviderConfig();
    loadProviderConfigs();
    setView(location.hash || "overview", { updateHash: !location.hash });
    initCodexAuths();
    initCursorAuths();
    initClineAuths();
    initGrokAuths();
    initPairing();
    load();
  `;
}
