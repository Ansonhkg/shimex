export function pairingCard() {
  return [
    '<div class="span-12 pairing-page" id="pairing-card">',
    '  <section class="pairing-card">',
    '    <div class="pairing-section">',
    '      <div class="pairing-section-head">',
    '        <div>',
    '          <div class="pairing-kicker">Access</div>',
    '          <h3 class="pairing-title">Connection mode</h3>',
    '          <p class="pairing-desc">Run this machine as the host gateway or as a paired client.</p>',
    '        </div>',
    '      </div>',
    '      <div class="pairing-mode-grid">',
    '        <div>',
    '          <div class="pairing-mode-toggle" role="group" aria-label="Connection mode">',
    '            <button id="mode-host" type="button" aria-pressed="true">Host</button>',
    '            <button id="mode-client" type="button" aria-pressed="false">Client</button>',
    '          </div>',
    '          <div id="pairing-mode-label" class="pairing-sr-only"></div>',
    '        </div>',
    '        <div class="pairing-state-card">',
    '          <div id="pairing-meta" class="pairing-state-line">loading…</div>',
    '          <div class="pairing-refresh"><span class="pairing-status-dot" aria-hidden="true"></span>Refreshing every 15 seconds</div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="pairing-section">',
    '      <div class="pairing-section-head">',
    '        <div>',
    '          <div class="pairing-kicker">Invite</div>',
    '          <h3 class="pairing-title">Client command</h3>',
    '          <p class="pairing-desc">Create a one-time command for another machine on LAN or Tailscale.</p>',
    '        </div>',
    '        <div class="pairing-actions">',
    '          <button id="pairing-generate" type="button" class="primary">Create client command</button>',
    '        </div>',
    '      </div>',
    '      <div class="pairing-command-box">',
    '        <div id="pairing-code-box" class="pairing-code-box">No active client command</div>',
    '        <button id="pairing-copy" type="button" class="ghost pairing-copy" aria-label="Copy command" title="Copy command" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="1.5"></rect><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"></path></svg></button>',
    '      </div>',
    '      <div id="pairing-code-expires" class="pairing-expiry">Create a one-time command for another machine on LAN/Tailscale.</div>',
    '    </div>',
    '    <div class="pairing-section">',
    '      <div class="pairing-section-head">',
    '        <div>',
    '          <div class="pairing-kicker">Clients</div>',
    '          <h3 class="pairing-title">Paired clients</h3>',
    '          <p class="pairing-desc">Revoke access for machines that no longer need this host.</p>',
    '        </div>',
    '        <div class="pairing-actions">',
    '          <button id="pairing-revoke-all" type="button" class="danger">Revoke all clients</button>',
    '        </div>',
    '      </div>',
    '      <div id="pairing-clients" class="pairing-clients"><div class="pairing-empty">None yet</div></div>',
    '    </div>',
    '  </section>',
    '  <aside class="pairing-security-note">',
    '    <span class="pairing-security-icon" aria-hidden="true">',
    '      <svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3Z"></path><path d="m9 12 2 2 4-4"></path></svg>',
    '    </span>',
    '    <span>Provider secrets stay on the host. Clients use revocable scoped tokens.</span>',
    '  </aside>',
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
        codeExpires: document.getElementById('pairing-code-expires'),
        clients: document.getElementById('pairing-clients'),
      };
      if (!els.meta) return;
      let currentCommand = '';
      let currentMode = 'host';

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
          '<div class="pairing-command">' + escapeHtml(currentCommand) + '</div>';
        els.codeExpires.textContent = 'expires ' + (code.expiresAt || '') + ' · one-time use';
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

      function setModeButtons(mode) {
        if (els.modeHost) {
          els.modeHost.classList.toggle('primary', mode === 'host');
          els.modeHost.setAttribute('aria-pressed', mode === 'host' ? 'true' : 'false');
        }
        if (els.modeClient) {
          els.modeClient.classList.toggle('primary', mode === 'client');
          els.modeClient.setAttribute('aria-pressed', mode === 'client' ? 'true' : 'false');
        }
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
          currentMode = mode;
          const clientCount = (data.clients || []).length;
          els.meta.textContent = mode.charAt(0).toUpperCase() + mode.slice(1) + ' · ' + String(clientCount) + ' client' + (clientCount === 1 ? '' : 's');
          els.meta.style.color = 'var(--text)';
          els.modeLabel.textContent = 'Current mode: ' + mode + (data.advertiseUrl ? (' · advertise ' + data.advertiseUrl) : '');
          setModeButtons(mode);
          const codes = data.activeCodes || [];
          if (codes.length) {
            const code = codes[codes.length - 1];
            renderCode(code, data.advertiseUrl || '');
          } else {
            currentCommand = '';
            els.copy.disabled = true;
            els.codeBox.textContent = 'No active client command';
            els.codeExpires.textContent = 'Create a one-time command for another machine on LAN/Tailscale.';
          }
          const clients = data.clients || [];
          if (!clients.length) {
            els.clients.innerHTML = '<div class="pairing-empty">None yet</div>';
          } else {
            els.clients.innerHTML = clients.map(function (client) {
              const scopes = (client.scopes || []).map(function (scope) {
                return '<span class="pairing-scope-chip">' + escapeHtml(scope) + '</span>';
              }).join('');
              const label = client.label || client.id;
              const icon = /mac|laptop|book/i.test(label)
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="12" rx="1.5"></rect><path d="M3 19h18"></path><path d="M8 19v1h8v-1"></path></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="1.5"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path></svg>';
              return '<div class="pairing-client-row">' +
                '<div class="pairing-client-identity" title="' + escapeHtml(client.id) + '">' +
                  '<span class="pairing-client-icon">' + icon + '</span>' +
                  '<div><strong>' + escapeHtml(label) + '</strong><div class="pairing-scopes">' + (scopes || '<span class="muted">No scopes</span>') + '</div></div>' +
                '</div>' +
                '<button data-revoke="' + escapeHtml(client.id) + '" type="button" class="danger pairing-revoke">Revoke</button>' +
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

      function requestModeChange(mode) {
        if (mode === currentMode) return;
        const nextLabel = mode === 'host' ? 'Host' : 'Client';
        const confirmed = window.confirm(
          'Switch to ' + nextLabel + ' mode? Switching modes can interrupt paired clients and may require them to be configured again. Continue?'
        );
        if (confirmed) setMode(mode);
      }

      els.modeHost.addEventListener('click', function () { requestModeChange('host'); });
      els.modeClient.addEventListener('click', function () { requestModeChange('client'); });
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
