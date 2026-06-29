import { access } from "node:fs/promises";
import { resolveCodexPaths } from "./paths.js";

export async function codexDoctor(config) {
  const paths = resolveCodexPaths(config);
  const source = await exists(paths.sourceApp);
  return {
    ok: source,
    sourceCodexApp: {
      path: paths.sourceApp,
      exists: source,
    },
    managedShimexApp: {
      path: paths.managedApp,
      exists: await exists(paths.managedApp),
    },
    profileHome: paths.profileHome,
    userDataDir: paths.userDataDir,
    originalCodexUntouched: true,
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

