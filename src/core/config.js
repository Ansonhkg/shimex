import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { loadProjectEnv } from "./env.js";
import { expandEnv, expandHome, projectRoot } from "./paths.js";
import { parseSimpleYaml } from "./simpleYaml.js";

export async function loadShimexConfig(path = join(projectRoot(), "shimex.yml")) {
  await loadProjectEnv();
  const text = await readFile(path, "utf8");
  const parsed = parseSimpleYaml(text);
  return normalizeConfig(parsed);
}

export function normalizeConfig(raw) {
  return {
    project: {
      name: raw.project?.name || "shimex",
      packageManager: raw.project?.package_manager || "npm",
    },
    runtime: {
      host: raw.runtime?.host || "127.0.0.1",
      port: Number(process.env.SHIMEX_PORT || raw.runtime?.port || 5413),
      publicUrl: normalizePublicUrl(process.env.SHIMEX_PUBLIC_URL ?? raw.runtime?.public_url ?? raw.runtime?.publicUrl),
      home: expandHome(raw.runtime?.home || "~/.shimex"),
      mode: normalizeMode(process.env.SHIMEX_MODE ?? raw.runtime?.mode),
      advertiseUrl: normalizePublicUrl(process.env.SHIMEX_ADVERTISE_URL ?? raw.runtime?.advertise_url ?? raw.runtime?.advertiseUrl),
    },
    codex: {
      sourceApp: raw.codex?.source_app || "auto",
      managedAppName: raw.codex?.managed_app_name || "Shimex",
      bundleIdentifier: raw.codex?.bundle_identifier || "xyz.shimex.app",
      managedAppPath: raw.codex?.managed_app_path || "~/Applications/Shimex.app",
      profileHome: raw.codex?.profile_home || "~/.shimex/codex-profile",
      userDataDir: raw.codex?.user_data_dir || "~/.shimex/codex-user-data",
      iconPath: normalizeProjectPath(raw.codex?.icon_path || "icon.icns"),
      seedLocalAuth: raw.codex?.seed_local_auth !== false,
      localAuthKey: String(raw.codex?.local_auth_key || "shimex-local-api-key"),
      mcpServers: normalizeMcpServers(raw.codex?.mcp_servers),
      webSearch: normalizeWebSearch(raw.codex?.web_search),
    },
    providers: (raw.providers || []).map((provider) => normalizeProviderConfig(provider)),
  };
}

function normalizeMcpServers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((server) => ({
    id: String(server.id || "").trim(),
    enabled: server.enabled !== false,
    required: server.required === true,
    command: server.command ? expandEnv(String(server.command)) : "",
    args: Array.isArray(server.args) ? server.args.map((item) => expandEnv(String(item))) : [],
    cwd: server.cwd ? expandHome(expandEnv(String(server.cwd))) : "",
    url: server.url ? expandEnv(String(server.url)) : "",
    bearerTokenEnvVar: server.bearer_token_env_var
      ? String(server.bearer_token_env_var)
      : "",
  })).filter((server) => {
    if (!server.id || !/^[A-Za-z0-9_-]+$/.test(server.id)) {
      throw new Error(`codex.mcp_servers requires a safe id: ${server.id || "missing"}`);
    }
    if (Boolean(server.command) === Boolean(server.url)) {
      throw new Error(`codex.mcp_servers.${server.id} requires exactly one of command or url`);
    }
    return true;
  });
}

function normalizeWebSearch(value) {
  const mode = String(value || "cached");
  if (!["disabled", "cached", "indexed", "live"].includes(mode)) {
    throw new Error(`codex.web_search must be disabled, cached, indexed, or live: ${mode}`);
  }
  return mode;
}


function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "host" || mode === "client") {
    return mode;
  }
  return "";
}

function normalizePublicUrl(value) {
  const raw = expandEnv(String(value || "")).trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`runtime.public_url must be an http(s) origin: ${raw}`);
  }
  return url.origin;
}

function normalizeProjectPath(value) {
  const expanded = expandEnv(String(value || ""));
  return isAbsolute(expanded) ? expanded : resolve(projectRoot(), expanded);
}

function normalizeProviderConfig(provider) {
  return {
    id: provider.id,
    enabled: provider.enabled !== false,
    endpoint: provider.endpoint ? expandEnv(String(provider.endpoint)) : "",
    auth: provider.auth || null,
    models: normalizeModels(provider.models),
    options: provider,
  };
}

function normalizeModels(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((model) => ({
    slug: model.slug,
    displayName: model.display_name || model.displayName || model.slug,
    upstreamModel: model.upstream_model || model.upstreamModel || model.model || model.slug,
    contextWindow: Number(model.context_window || model.contextWindow || 128000),
    inputModalities: model.input_modalities || model.inputModalities || ["text"],
    codexDisplayName: model.codex_display_name || model.codexDisplayName || "",
    codexVisible: (model.codex_visible ?? model.codexVisible) !== false,
    supportsSearchTool: model.supports_search_tool ?? model.supportsSearchTool ?? false,
    webSearchToolType: model.web_search_tool_type || model.webSearchToolType || null,
  }));
}
