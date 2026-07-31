export function providerConfigCard() {
  return [
    '<section class="panel" id="panel-provider" data-panel="provider">',
    '  <div id="provider-config-empty" class="empty">Loading provider configuration…</div>',
    '  <form id="provider-config-form" class="provider-config-form" hidden>',
    '    <div class="provider-config-card">',
    '      <div class="provider-config-head">',
    '        <div class="provider-config-head-copy">',
    '          <div class="provider-config-kicker">Connection</div>',
    '          <p class="provider-config-description muted">Endpoint and auth reference for this provider.</p>',
    '          <!-- Hidden identity hooks kept for runtime status text. -->',
    '          <span id="provider-config-name" hidden>Provider</span>',
    '          <span id="provider-config-description" hidden></span>',
    '        </div>',
    '        <label class="provider-enabled-toggle"><input id="provider-config-enabled" type="checkbox" /> <span>Enabled</span></label>',
    '      </div>',
    '      <div class="provider-config-fields">',
    '        <label class="provider-field"><span>Endpoint</span><input id="provider-config-endpoint" type="text" placeholder="https://provider.example/v1 or ${ENV_NAME}" autocomplete="off" /></label>',
    '        <label class="provider-field"><span>Authentication type</span><input id="provider-config-auth-type" type="text" placeholder="env (leave blank for none)" autocomplete="off" /></label>',
    '        <label class="provider-field"><span>Environment variable</span><input id="provider-config-auth-name" type="text" placeholder="PROVIDER_API_KEY" autocomplete="off" /></label>',
    '      </div>',
    '      <div class="provider-config-models-section">',
    '        <div class="provider-config-models-head">',
    '          <div>',
    '            <h3>Models</h3>',
    '            <p class="muted">Model entries from this provider’s section of <code>shimex.yml</code>.</p>',
    '          </div>',
    '          <button id="provider-config-add-model" class="ghost" type="button">Add model</button>',
    '        </div>',
    '        <div id="provider-config-models" class="provider-config-models"></div>',
    '      </div>',
    '      <div class="provider-config-footer">',
    '        <div class="provider-config-actions">',
    '          <button id="provider-config-reload" class="ghost" type="button">Reload</button>',
    '          <button id="provider-config-save" class="primary" type="submit">Save</button>',
    '          <button id="provider-config-save-restart" class="ghost" type="button">Save + restart</button>',
    '        </div>',
    '        <p id="provider-config-status" class="config-status">Loading provider configuration…</p>',
    '        <p class="config-note">This updates only this provider’s entry in <code>shimex.yml</code>. Keep secret values in <code>.env</code> and reference them by name.</p>',
    '      </div>',
    '    </div>',
    '  </form>',
    '</section>',
  ].join("\n");
}

export function providerConfigRuntimeHelpers() {
  return `
    const PROVIDER_FORM_META = {
      "ollama": { label: "Ollama", subtitle: "Local Ollama endpoint and exposed models." },
      "deepseek": { label: "DeepSeek", subtitle: "DeepSeek endpoint, credential reference, and exposed models." },
      "cloudflare-workers-ai": { label: "Cloudflare Workers AI", subtitle: "Cloudflare Workers AI account endpoint and model routing." },
      "openai-responses": { label: "OpenAI Responses", subtitle: "OpenAI Responses endpoint and credential reference." },
      "lm-studio": { label: "LM Studio", subtitle: "Local LM Studio endpoint and exposed models." },
    };
    const PROVIDER_FORM_ORDER = ["ollama", "deepseek", "cloudflare-workers-ai", "openai-responses", "lm-studio"];
    const providerConfigEls = {};
    const providerConfigState = { providers: {}, originals: {}, activeId: "", loaded: false, busy: false };

    function providerIdFromView(raw) {
      const value = String(raw || "").replace(/^#/, "").trim().toLowerCase();
      if (!value.startsWith("provider-")) return "";
      const id = value.slice("provider-".length);
      return PROVIDER_FORM_META[id] ? id : "";
    }

    function providerViewMeta(id) {
      const meta = PROVIDER_FORM_META[id] || { label: "Provider", subtitle: "Provider configuration from shimex.yml." };
      return { title: meta.label, subtitle: meta.subtitle };
    }

    function initProviderConfig() {
      providerConfigEls.nav = document.getElementById("provider-config-nav");
      providerConfigEls.empty = document.getElementById("provider-config-empty");
      providerConfigEls.form = document.getElementById("provider-config-form");
      providerConfigEls.name = document.getElementById("provider-config-name");
      providerConfigEls.description = document.getElementById("provider-config-description");
      providerConfigEls.enabled = document.getElementById("provider-config-enabled");
      providerConfigEls.endpoint = document.getElementById("provider-config-endpoint");
      providerConfigEls.authType = document.getElementById("provider-config-auth-type");
      providerConfigEls.authName = document.getElementById("provider-config-auth-name");
      providerConfigEls.models = document.getElementById("provider-config-models");
      providerConfigEls.addModel = document.getElementById("provider-config-add-model");
      providerConfigEls.reload = document.getElementById("provider-config-reload");
      providerConfigEls.save = document.getElementById("provider-config-save");
      providerConfigEls.saveRestart = document.getElementById("provider-config-save-restart");
      providerConfigEls.status = document.getElementById("provider-config-status");
      if (!providerConfigEls.form) return;
      providerConfigEls.form.addEventListener("submit", (event) => { event.preventDefault(); saveProviderConfig(); });
      [providerConfigEls.enabled, providerConfigEls.endpoint, providerConfigEls.authType, providerConfigEls.authName].forEach((input) => {
        if (input) input.addEventListener("input", markProviderConfigDirty);
        if (input) input.addEventListener("change", markProviderConfigDirty);
      });
      if (providerConfigEls.addModel) providerConfigEls.addModel.addEventListener("click", addProviderModel);
      if (providerConfigEls.reload) providerConfigEls.reload.addEventListener("click", loadProviderConfigs);
      if (providerConfigEls.saveRestart) providerConfigEls.saveRestart.addEventListener("click", () => saveProviderConfig({ restart: true }));
    }

    function cloneProviderConfig(value) {
      return JSON.parse(JSON.stringify(value || {}));
    }

    function configuredProvider(id) {
      return providerConfigState.providers[id] || null;
    }

    function renderProviderConfigNavigation() {
      if (!providerConfigEls.nav) return;
      providerConfigEls.nav.querySelectorAll("[data-provider-config-id]").forEach((item) => {
        const id = item.getAttribute("data-provider-config-id");
        item.hidden = !configuredProvider(id);
      });
    }

    function providerConfigValue(value) {
      return value == null ? "" : String(value);
    }

    function renderProviderModels(provider) {
      if (!providerConfigEls.models) return;
      const models = Array.isArray(provider.models) ? provider.models : [];
      if (!models.length) {
        providerConfigEls.models.innerHTML = '<div class="provider-model-empty">No explicit models. Shimex will use this provider’s discovery behavior.</div>';
        return;
      }
      providerConfigEls.models.innerHTML = models.map((model, index) => {
        const modalities = Array.isArray(model.input_modalities) ? model.input_modalities.join(", ") : providerConfigValue(model.input_modalities);
        const visible = model.codex_visible !== false;
        return '<fieldset class="provider-model-card" data-model-index="' + index + '">' +
          '<legend>Model ' + (index + 1) + '</legend>' +
          '<button class="danger provider-model-remove" type="button" data-provider-model-remove="' + index + '">Remove</button>' +
          '<div class="provider-model-grid">' +
            '<label><span>Slug</span><input data-provider-model-field="slug" type="text" value="' + escapeHtml(providerConfigValue(model.slug)) + '" autocomplete="off" /></label>' +
            '<label><span>Display name</span><input data-provider-model-field="display_name" type="text" value="' + escapeHtml(providerConfigValue(model.display_name)) + '" autocomplete="off" /></label>' +
            '<label><span>Upstream model</span><input data-provider-model-field="upstream_model" type="text" value="' + escapeHtml(providerConfigValue(model.upstream_model)) + '" autocomplete="off" /></label>' +
            '<label><span>Context window</span><input data-provider-model-field="context_window" type="number" min="1" value="' + escapeHtml(providerConfigValue(model.context_window)) + '" autocomplete="off" /></label>' +
            '<label><span>Input modalities</span><input data-provider-model-field="input_modalities" type="text" value="' + escapeHtml(modalities) + '" placeholder="text, image" autocomplete="off" /></label>' +
            '<label><span>Codex display name</span><input data-provider-model-field="codex_display_name" type="text" value="' + escapeHtml(providerConfigValue(model.codex_display_name)) + '" autocomplete="off" /></label>' +
            '<label class="provider-model-visible"><input data-provider-model-field="codex_visible" type="checkbox"' + (visible ? ' checked' : '') + ' /> <span>Visible in Codex</span></label>' +
          '</div>' +
        '</fieldset>';
      }).join("");
      providerConfigEls.models.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", markProviderConfigDirty);
        input.addEventListener("change", markProviderConfigDirty);
      });
      providerConfigEls.models.querySelectorAll("[data-provider-model-remove]").forEach((button) => {
        button.addEventListener("click", () => removeProviderModel(Number(button.getAttribute("data-provider-model-remove"))));
      });
    }

    function renderProviderConfig(id) {
      const provider = configuredProvider(id);
      providerConfigState.activeId = id || "";
      if (!provider) {
        if (providerConfigEls.form) providerConfigEls.form.hidden = true;
        if (providerConfigEls.empty) {
          providerConfigEls.empty.hidden = false;
          providerConfigEls.empty.textContent = providerConfigState.loaded
            ? "This provider is not configured in shimex.yml."
            : "Loading provider configuration…";
        }
        return;
      }
      const meta = PROVIDER_FORM_META[id];
      if (providerConfigEls.empty) providerConfigEls.empty.hidden = true;
      if (providerConfigEls.form) providerConfigEls.form.hidden = false;
      if (providerConfigEls.name) providerConfigEls.name.textContent = meta.label;
      if (providerConfigEls.description) providerConfigEls.description.textContent = meta.subtitle;
      if (providerConfigEls.enabled) providerConfigEls.enabled.checked = provider.enabled !== false;
      if (providerConfigEls.endpoint) providerConfigEls.endpoint.value = providerConfigValue(provider.endpoint);
      const auth = provider.auth && typeof provider.auth === "object" ? provider.auth : {};
      if (providerConfigEls.authType) providerConfigEls.authType.value = providerConfigValue(auth.type);
      if (providerConfigEls.authName) providerConfigEls.authName.value = providerConfigValue(auth.name);
      renderProviderModels(provider);
      setProviderConfigStatus("Loaded " + meta.label + " from shimex.yml.", "ok");
      markProviderConfigDirty();
    }

    function providerValueOrDelete(target, key, value) {
      const text = String(value == null ? "" : value).trim();
      if (text) target[key] = text;
      else delete target[key];
    }

    function readProviderConfigForm() {
      const id = providerConfigState.activeId;
      const original = configuredProvider(id);
      if (!original) return null;
      const provider = cloneProviderConfig(original);
      provider.enabled = Boolean(providerConfigEls.enabled && providerConfigEls.enabled.checked);
      providerValueOrDelete(provider, "endpoint", providerConfigEls.endpoint && providerConfigEls.endpoint.value);
      const authType = String(providerConfigEls.authType && providerConfigEls.authType.value || "").trim();
      const authName = String(providerConfigEls.authName && providerConfigEls.authName.value || "").trim();
      if (!authType) {
        delete provider.auth;
      } else {
        provider.auth = provider.auth && typeof provider.auth === "object" ? provider.auth : {};
        provider.auth.type = authType;
        if (authName) provider.auth.name = authName;
        else delete provider.auth.name;
      }
      const originalModels = Array.isArray(original.models) ? original.models : [];
      const cards = providerConfigEls.models ? Array.from(providerConfigEls.models.querySelectorAll("[data-model-index]")) : [];
      provider.models = cards.map((card) => {
        const index = Number(card.getAttribute("data-model-index"));
        const model = cloneProviderConfig(originalModels[index] || {});
        const fields = {};
        card.querySelectorAll("[data-provider-model-field]").forEach((input) => {
          fields[input.getAttribute("data-provider-model-field")] = input;
        });
        ["slug", "display_name", "upstream_model", "codex_display_name"].forEach((key) => providerValueOrDelete(model, key, fields[key] && fields[key].value));
        const context = String(fields.context_window && fields.context_window.value || "").trim();
        if (context) model.context_window = Number(context);
        else delete model.context_window;
        const modalities = String(fields.input_modalities && fields.input_modalities.value || "").split(",").map((value) => value.trim()).filter(Boolean);
        model.input_modalities = modalities;
        if (fields.codex_visible && !fields.codex_visible.checked) model.codex_visible = false;
        else if (model.codex_visible === false) model.codex_visible = true;
        else delete model.codex_visible;
        return model;
      });
      return provider;
    }

    function markProviderConfigDirty() {
      const provider = readProviderConfigForm();
      const original = providerConfigState.originals[providerConfigState.activeId] || null;
      const dirty = Boolean(provider && original && JSON.stringify(provider) !== JSON.stringify(original));
      if (providerConfigEls.form) providerConfigEls.form.classList.toggle("dirty", dirty);
      if (dirty) setProviderConfigStatus("Unsaved changes", "warn");
    }

    function addProviderModel() {
      const id = providerConfigState.activeId;
      const provider = readProviderConfigForm();
      if (!provider || !id) return;
      provider.models = Array.isArray(provider.models) ? provider.models : [];
      provider.models.push({ slug: "", display_name: "", upstream_model: "", context_window: 128000, input_modalities: ["text"] });
      providerConfigState.providers[id] = provider;
      renderProviderConfig(id);
      setProviderConfigStatus("New model added. Fill in its routing fields before saving.", "warn");
    }

    function removeProviderModel(index) {
      const id = providerConfigState.activeId;
      const provider = readProviderConfigForm();
      if (!provider || !Array.isArray(provider.models)) return;
      provider.models.splice(index, 1);
      providerConfigState.providers[id] = provider;
      renderProviderConfig(id);
      setProviderConfigStatus("Model removed. Save to apply the change.", "warn");
    }

    function setProviderConfigBusy(busy) {
      providerConfigState.busy = Boolean(busy);
      [providerConfigEls.enabled, providerConfigEls.endpoint, providerConfigEls.authType, providerConfigEls.authName, providerConfigEls.addModel, providerConfigEls.reload, providerConfigEls.save, providerConfigEls.saveRestart].forEach((item) => {
        if (item) item.disabled = providerConfigState.busy;
      });
      if (providerConfigEls.models) providerConfigEls.models.querySelectorAll("input, button").forEach((item) => { item.disabled = providerConfigState.busy; });
    }

    function setProviderConfigStatus(message, kind) {
      if (!providerConfigEls.status) return;
      providerConfigEls.status.textContent = message || "";
      providerConfigEls.status.className = "config-status" + (kind ? (" " + kind) : "");
    }

    async function loadProviderConfigs() {
      if (providerConfigState.busy) return;
      setProviderConfigBusy(true);
      try {
        const response = await fetch("/api/config/providers");
        const result = await parseJson(response);
        if (!response.ok) throw new Error((result && result.error && (result.error.message || result.error)) || ("HTTP " + response.status));
        providerConfigState.providers = {};
        providerConfigState.originals = {};
        (result.providers || []).forEach((provider) => {
          if (provider && PROVIDER_FORM_META[provider.id]) {
            providerConfigState.providers[provider.id] = provider;
            providerConfigState.originals[provider.id] = cloneProviderConfig(provider);
          }
        });
        providerConfigState.loaded = true;
        renderProviderConfigNavigation();
        const requested = providerIdFromView(location.hash);
        const id = requested || providerConfigState.activeId;
        if (state.view === "provider" || requested) renderProviderConfig(id);
      } catch (error) {
        providerConfigState.loaded = false;
        if (providerConfigEls.nav) providerConfigEls.nav.innerHTML = "";
        if (state.view === "provider" && providerConfigEls.empty) {
          providerConfigEls.empty.hidden = false;
          providerConfigEls.empty.textContent = "Could not load provider configuration: " + String(error && error.message || error);
        }
        setProviderConfigStatus("Could not load provider configuration: " + String(error && error.message || error), "err");
      } finally {
        setProviderConfigBusy(false);
      }
    }

    async function saveProviderConfig(options = {}) {
      const provider = readProviderConfigForm();
      if (!provider || !providerConfigState.activeId) return false;
      const restart = Boolean(options.restart);
      setProviderConfigBusy(true);
      setProviderConfigStatus(restart ? "Saving and restarting…" : "Saving…");
      try {
        const response = await fetch("/api/config/providers/" + encodeURIComponent(providerConfigState.activeId), {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ provider }),
        });
        const result = await parseJson(response);
        if (!response.ok) throw new Error((result && result.error) || ("HTTP " + response.status));
        providerConfigState.providers[provider.id] = result.provider || provider;
        providerConfigState.originals[provider.id] = cloneProviderConfig(providerConfigState.providers[provider.id]);
        renderProviderConfig(provider.id);
        setProviderConfigStatus(result.message || "Provider configuration saved.", "ok");
        toast("Provider saved", PROVIDER_FORM_META[provider.id].label, "ok");
        if (!state.configDirty) {
          state.configOriginal = "";
          state.configText = "";
        }
        if (restart) {
          const restartResponse = await fetch("/api/host/restart", { method: "POST", headers: { accept: "application/json" } });
          const restartResult = await parseJson(restartResponse);
          if (!restartResponse.ok) throw new Error((restartResult && restartResult.error && (restartResult.error.message || restartResult.error)) || ("HTTP " + restartResponse.status));
          setProviderConfigStatus("Saved. Host restart requested — reload this page in a few seconds.", "warn");
          toast("Host restarting", "Reload admin after a few seconds", "warn");
        }
        return true;
      } catch (error) {
        setProviderConfigStatus("Save failed: " + String(error && error.message || error), "err");
        toast("Provider save failed", String(error && error.message || error), "err");
        return false;
      } finally {
        setProviderConfigBusy(false);
      }
    }
  `;
}
