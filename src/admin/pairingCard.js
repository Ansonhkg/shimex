export function pairingCard() {
  return [
    '<div class="card span-12" id="pairing-card">',
    '  <div class="head">',
    '    <h2>Host / Client pairing</h2>',
    '    <span class="meta" id="pairing-meta">loading…</span>',
    '  </div>',
    '  <div class="pairing-grid">',
    '    <div class="pairing-panel">',
    '      <h3>Mode</h3>',
    '      <p class="muted">Host keeps provider secrets. Clients pair with a short code and use the host gateway.</p>',
    '      <div class="button-row" style="margin-top:10px;">',
    '        <button id="mode-host" type="button">Host mode</button>',
    '        <button id="mode-client" type="button" class="ghost">Client mode</button>',
    '      </div>',
    '      <div id="pairing-mode-label" class="muted" style="margin-top:8px;"></div>',
    '    </div>',
    '    <div class="pairing-panel">',
    '      <h3>Connect another machine</h3>',
    '      <p class="muted">Create a one-time command for another machine on LAN/Tailscale.</p>',
    '      <div class="button-row" style="margin-top:10px;">',
    '        <button id="pairing-generate" type="button" class="primary">Create client command</button>',
    '        <button id="pairing-copy" type="button" class="ghost" disabled>Copy command</button>',
    '        <button id="pairing-revoke-all" type="button" class="ghost">Revoke all clients</button>',
    '      </div>',
    '      <div id="pairing-code-box" class="pairing-code-box">No active code</div>',
    '    </div>',
    '    <div class="pairing-panel">',
    '      <h3>Paired clients</h3>',
    '      <div id="pairing-clients" class="pairing-clients"><div class="muted">None yet</div></div>',
    '    </div>',
    '  </div>',
    '  <div class="pairing-help">',
    '    The command expires after five minutes and can pair one client. Create another whenever needed.',
    '  </div>',
    '</div>',
  ].join("\n");
}

export function pairingRuntimeHelpers() {
  return `
    function initPairing() {
      const els = {
        meta: document.getElementById('pairing-meta'),
        modeLabel: document.getElementById('pairing-mode-label'),
        modeHost: document.getElementById('mode-host'),
        modeClient: document.getElementById('mode-client'),
        generate: document.getElementById('pairing-generate'),
        copy: document.getElementById('pairing-copy'),
        revokeAll: document.getElementById('pairing-revoke-all'),
        codeBox: document.getElementById('pairing-code-box'),
        clients: document.getElementById('pairing-clients'),
      };
      if (!els.meta) return;
      let currentCommand = '';

      function clientCommand(advertiseUrl, code) {
        const origin = String(advertiseUrl || '').replace(/\\/+$/, '');
        const body = String(code || '').split('@')[0];
        if (!origin || !body) return '';
        return "curl -fsSL '" + origin + '/join/setup.sh?c=' + encodeURIComponent(body) + "' | bash";
      }

      function renderCode(code, advertiseUrl) {
        currentCommand = clientCommand(code.advertiseUrl || advertiseUrl || '', code.code || code.displayCode || '');
        els.copy.disabled = !currentCommand;
        if (!currentCommand) {
          els.codeBox.textContent = 'No active client command';
          return;
        }
        els.codeBox.innerHTML =
          '<div class="pairing-command">' + escapeHtml(currentCommand) + '</div>' +
          '<div class="muted">expires ' + escapeHtml(code.expiresAt || '') + ' · one-time use</div>';
      }

      async function copyCommand(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard is unavailable');
      }

      async function loadPairing() {
        try {
          const response = await fetch('/api/access');
          const data = await parseJson(response);
          if (!response.ok) {
            els.meta.textContent = 'unavailable';
            els.meta.style.color = 'var(--danger)';
            return;
          }
          const mode = data.mode || 'host';
          els.meta.textContent = mode + ' · ' + String((data.clients || []).length) + ' clients';
          els.meta.style.color = 'var(--muted)';
          els.modeLabel.textContent = 'Current mode: ' + mode + (data.advertiseUrl ? (' · advertise ' + data.advertiseUrl) : '');
          els.modeHost.classList.toggle('primary', mode === 'host');
          els.modeClient.classList.toggle('primary', mode === 'client');
          const codes = data.activeCodes || [];
          if (codes.length) {
            const code = codes[codes.length - 1];
            renderCode(code, data.advertiseUrl || '');
          } else {
            currentCommand = '';
            els.copy.disabled = true;
            els.codeBox.textContent = 'No active client command';
          }
          const clients = data.clients || [];
          if (!clients.length) {
            els.clients.innerHTML = '<div class="muted">None yet</div>';
          } else {
            els.clients.innerHTML = clients.map(function (client) {
              return '<div class="pairing-client-row">' +
                '<div><strong>' + escapeHtml(client.label || client.id) + '</strong>' +
                '<div class="muted">' + escapeHtml(client.id) + ' · scopes ' + escapeHtml((client.scopes || []).join(', ')) + '</div></div>' +
                '<button data-revoke="' + escapeHtml(client.id) + '" type="button" class="ghost">Revoke</button>' +
              '</div>';
            }).join('');
            els.clients.querySelectorAll('button[data-revoke]').forEach(function (button) {
              button.addEventListener('click', async function () {
                const id = this.getAttribute('data-revoke');
                const response = await fetch('/api/pair/clients/' + encodeURIComponent(id), { method: 'DELETE' });
                const result = await parseJson(response);
                if (!response.ok) {
                  toast('Revoke failed', (result && result.error) || ('HTTP ' + response.status), 'err');
                  return;
                }
                toast('Client revoked', id, 'ok');
                await loadPairing();
              });
            });
          }
        } catch (error) {
          els.meta.textContent = 'error';
          els.meta.style.color = 'var(--danger)';
        }
      }

      async function setMode(mode) {
        const response = await fetch('/api/mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: mode }),
        });
        const result = await parseJson(response);
        if (!response.ok) {
          toast('Mode change failed', (result && result.error) || ('HTTP ' + response.status), 'err');
          return;
        }
        toast('Mode updated', mode, 'ok');
        await loadPairing();
      }

      els.modeHost.addEventListener('click', function () { setMode('host'); });
      els.modeClient.addEventListener('click', function () { setMode('client'); });
      els.generate.addEventListener('click', async function () {
        const response = await fetch('/api/pair/code', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const result = await parseJson(response);
        if (!response.ok) {
          toast('Pairing code failed', (result && result.error) || ('HTTP ' + response.status), 'err');
          return;
        }
        await loadPairing();
        toast('Client command ready', currentCommand || result.displayCode || '', 'ok');
      });
      els.copy.addEventListener('click', async function () {
        if (!currentCommand) return;
        try {
          await copyCommand(currentCommand);
          toast('Command copied', 'Paste it into Terminal on the client machine.', 'ok');
        } catch (error) {
          toast('Copy failed', String(error && error.message || error), 'err');
        }
      });
      els.revokeAll.addEventListener('click', async function () {
        const response = await fetch('/api/pair/clients/revoke-all', { method: 'POST' });
        const result = await parseJson(response);
        if (!response.ok) {
          toast('Revoke all failed', (result && result.error) || ('HTTP ' + response.status), 'err');
          return;
        }
        toast('All clients revoked', String((result.revokedIds || []).length) + ' removed', 'ok');
        await loadPairing();
      });

      loadPairing();
      window.setInterval(loadPairing, 15000);
    }
  `;
}
