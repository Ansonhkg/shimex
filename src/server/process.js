import { mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { expandHome, projectRoot } from "../core/paths.js";

export async function ensureServerRunning(config) {
  const current = await serverHealth(config);
  if (current.ok) {
    return { started: false, url: current.url };
  }
  const logPath = join(expandHome(config.runtime.home), "server.log");
  mkdirSync(dirname(logPath), { recursive: true });
  const out = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [join(projectRoot(), "src", "cli", "main.js"), "server", "start"],
    {
      cwd: projectRoot(),
      detached: true,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        SHIMEX_PORT: String(config.runtime.port),
      },
    },
  );
  child.unref();
  await waitForServer(config);
  return { started: true, url: serverUrl(config), logPath };
}

export async function serverHealth(config) {
  const url = `${serverUrl(config)}/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!response.ok) {
      return { ok: false, url };
    }
    const payload = await response.json();
    return { ok: payload?.ok === true && payload?.service === "shimex", url };
  } catch {
    return { ok: false, url };
  }
}

async function waitForServer(config) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await serverHealth(config);
    if (health.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Shimex server did not start at ${serverUrl(config)}`);
}

function serverUrl(config) {
  return `http://${config.runtime.host}:${config.runtime.port}`;
}
