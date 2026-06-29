export function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shimex</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 32px; max-width: 960px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin-top: 28px; }
    button { min-width: 150px; margin: 0; padding: 6px 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid CanvasText; padding: 8px; text-align: left; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .actions { display: grid; gap: 10px; margin: 12px 0; }
    .action-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .action-copy { margin: 0; }
    .muted { opacity: 0.72; }
  </style>
</head>
<body>
  <h1>Shimex</h1>
  <p class="muted">Local provider gateway for managed Codex Desktop.</p>
  <h2>Health</h2>
  <pre id="health">loading...</pre>
  <h2>Codex App</h2>
  <div class="actions">
    <div class="action-row">
      <button data-action="/api/install">Preview setup</button>
      <p class="action-copy muted">Show the app copy, profile, catalog, and auth files Shimex would create. No files are changed.</p>
    </div>
    <div class="action-row">
      <button data-action="/api/install?apply=1">Set up app</button>
      <p class="action-copy muted">Create or replace the managed Shimex app and write its Codex profile.</p>
    </div>
    <div class="action-row">
      <button data-action="/api/sync">Preview update</button>
      <p class="action-copy muted">Show what would be refreshed from the current Codex app and provider model list. No files are changed.</p>
    </div>
    <div class="action-row">
      <button data-action="/api/sync?apply=1">Update app</button>
      <p class="action-copy muted">Refresh the managed Shimex app, profile, and model catalog.</p>
    </div>
    <div class="action-row">
      <button data-action="/api/open">Open Shimex</button>
      <p class="action-copy muted">Set up or update the managed app if needed, start the local backend, and launch Shimex.</p>
    </div>
  </div>
  <pre id="action"></pre>
  <h2>Models</h2>
  <table>
    <thead><tr><th>Model</th><th>Provider</th><th>Input</th><th>Context</th></tr></thead>
    <tbody id="models"></tbody>
  </table>
  <script>
    async function load() {
      const health = await fetch('/health').then((r) => r.json());
      const status = await fetch('/api/status').then((r) => r.json());
      document.getElementById('health').textContent = JSON.stringify({ health, doctor: status.doctor }, null, 2);
      const models = await fetch('/api/models').then((r) => r.json());
      document.getElementById('models').innerHTML = models.map((model) => (
        '<tr><td><code>' + model.slug + '</code><br>' + model.displayName + '</td>' +
        '<td>' + model.providerId + '</td>' +
        '<td>' + model.inputModalities.join(', ') + '</td>' +
        '<td>' + model.contextWindow + '</td></tr>'
      )).join('');
    }
    for (const button of document.querySelectorAll('button[data-action]')) {
      button.addEventListener('click', async () => {
        const action = button.getAttribute('data-action');
        const result = await fetch(action, { method: 'POST' }).then((r) => r.json());
        document.getElementById('action').textContent = JSON.stringify(result, null, 2);
        await load();
      });
    }
    load().catch((error) => {
      document.getElementById('health').textContent = String(error);
    });
  </script>
</body>
</html>`;
}
