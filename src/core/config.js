import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandEnv, expandHome, projectRoot } from "./paths.js";
import { parseSimpleYaml } from "./simpleYaml.js";

export async function loadShimexConfig(path = join(projectRoot(), "shimex.yml")) {
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
      port: Number(process.env.SHIMEX_PORT || raw.runtime?.port || 18765),
      home: expandHome(raw.runtime?.home || "~/.shimex"),
    },
    codex: {
      sourceApp: raw.codex?.source_app || "auto",
      managedAppName: raw.codex?.managed_app_name || "Shimex",
      managedAppPath: raw.codex?.managed_app_path || "~/Applications/Shimex.app",
      profileHome: raw.codex?.profile_home || "~/.shimex/codex-profile",
      userDataDir: raw.codex?.user_data_dir || "~/.shimex/codex-user-data",
    },
    providers: (raw.providers || []).map((provider) => normalizeProviderConfig(provider)),
  };
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
  }));
}
