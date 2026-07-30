import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { resolveCodexPaths } from "../clients/codex/paths.js";
import { readCodexAppMetadata } from "../clients/codex/lifecycle.js";

export async function getDesktopBundleInfo(config) {
  const paths = resolveCodexPaths(config);
  const managed = await readCodexAppMetadata(paths.managedApp);
  let size = 0;
  if (managed.exists) {
    try {
      // app bundle is a directory; size is best-effort via du if available later.
      await access(paths.managedApp);
      size = 0;
    } catch {
      size = 0;
    }
  }
  return {
    available: managed.exists,
    path: paths.managedApp,
    name: basename(paths.managedApp),
    version: managed.version || "",
    build: managed.build || "",
    size,
  };
}

export async function createDesktopBundleStream(config) {
  const info = await getDesktopBundleInfo(config);
  if (!info.available) {
    return {
      ok: false,
      status: 404,
      error: {
        message: "Managed Shimex.app is not installed on the host. Run host install/sync first.",
        type: "shimex_desktop_bundle_missing",
      },
    };
  }

  const appPath = info.path;
  const parent = dirname(appPath);
  const appName = basename(appPath);
  const child = spawn("tar", ["-czf", "-", "-C", parent, appName], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 4000) {
      stderr = stderr.slice(-4000);
    }
  });

  return {
    ok: true,
    status: 200,
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${appName.replace(/\.app$/i, "")}.tgz"`,
      "cache-control": "no-store",
      "x-shimex-app-name": appName,
      "x-shimex-app-version": info.version || "",
      "x-shimex-app-build": info.build || "",
    },
    stream: async (response) => {
      await new Promise((resolve, reject) => {
        child.stdout.on("error", reject);
        response.on("error", reject);
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() || `tar exited with ${code}`));
        });
        child.stdout.pipe(response);
      });
    },
  };
}
