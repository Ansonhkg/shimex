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
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid CanvasText; padding: 8px; text-align: left; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { opacity: 0.72; }
  </style>
</head>
<body>
  <h1>Shimex</h1>
  <p class="muted">Local provider gateway for managed Codex Desktop.</p>
  <h2>Health</h2>
  <pre id="health">loading...</pre>
  <h2>Models</h2>
  <table>
    <thead><tr><th>Model</th><th>Provider</th><th>Input</th><th>Context</th></tr></thead>
    <tbody id="models"></tbody>
  </table>
  <script>
    async function load() {
      const health = await fetch('/health').then((r) => r.json());
      document.getElementById('health').textContent = JSON.stringify(health, null, 2);
      const models = await fetch('/api/models').then((r) => r.json());
      document.getElementById('models').innerHTML = models.map((model) => (
        '<tr><td><code>' + model.slug + '</code><br>' + model.displayName + '</td>' +
        '<td>' + model.providerId + '</td>' +
        '<td>' + model.inputModalities.join(', ') + '</td>' +
        '<td>' + model.contextWindow + '</td></tr>'
      )).join('');
    }
    load().catch((error) => {
      document.getElementById('health').textContent = String(error);
    });
  </script>
</body>
</html>`;
}

