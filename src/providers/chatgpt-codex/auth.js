import { readFile } from "node:fs/promises";
import { expandHome } from "../../core/paths.js";

const DEFAULT_CODEX_AUTH = "~/.codex/auth.json";

export async function readCodexAuth(options = {}) {
  const path = expandHome(options.authPath || process.env.CODEX_AUTH_PATH || DEFAULT_CODEX_AUTH);
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  const tokens = data?.tokens;
  if (!tokens?.access_token) {
    return null;
  }
  return {
    accessToken: tokens.access_token,
    accountId: tokens.account_id || "",
  };
}

