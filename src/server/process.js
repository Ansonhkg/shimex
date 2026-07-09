import { closeSync, mkdirSync, openSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { expandHome, projectRoot } from "../core/paths.js";

export async function ensureServerRunning(config) {
  const current = await serverHealth(config);
  const paths = serverPaths(config);
  if (current.ok) {
    const pid = await readServerPid(paths.pidPath);
    return { started: false, url: current.url, publicUrl: publicServerUrl(config), pid: pid.pid, pidAlive: pid.alive, pidPath: paths.pidPath };
  }
  mkdirSync(dirname(paths.logPath), { recursive: true });
  const out = openSync(paths.logPath, "a");
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
  if (child.pid) {
    await writeServerPid(config, child.pid, { mode: "detached", logPath: paths.logPath });
  }
  child.unref();
  closeSync(out);
  await waitForServer(config);
  return { started: true, url: serverUrl(config), publicUrl: publicServerUrl(config), logPath: paths.logPath, pid: child.pid, pidPath: paths.pidPath };
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

export async function serverStatus(config) {
  const paths = serverPaths(config);
  const health = await serverHealth(config);
  const pid = await readServerPid(paths.pidPath);
  const portInUse = health.ok || await isPortInUse(config);
  return {
    running: health.ok,
    portInUse,
    url: serverUrl(config),
    publicUrl: publicServerUrl(config),
    health,
    pid: pid.pid,
    pidAlive: pid.alive,
    pidPath: paths.pidPath,
    logPath: paths.logPath,
    pidMetadata: pid.metadata,
  };
}

export async function stopServer(config) {
  const status = await serverStatus(config);
  if (!status.pid) {
    if (status.running) {
      const stoppedByApi = await requestServerStop(config);
      if (stoppedByApi) {
        await clearServerPid(config);
        return {
          stopped: true,
          method: "http",
          reason: "pid-missing",
          ...status,
          running: false,
        };
      }
    }
    return {
      stopped: false,
      reason: status.running ? "pid-missing" : "server-not-running",
      ...status,
    };
  }
  if (!status.pidAlive) {
    if (status.running) {
      const stoppedByApi = await requestServerStop(config);
      if (stoppedByApi) {
        await clearServerPid(config, status.pid);
        return {
          stopped: true,
          method: "http",
          reason: "pid-not-alive",
          ...status,
          running: false,
        };
      }
    }
    await clearServerPid(config, status.pid);
    return {
      stopped: false,
      reason: status.running ? "pid-not-alive-but-health-ok" : "pid-not-alive",
      ...status,
    };
  }
  process.kill(status.pid, "SIGTERM");
  const stopped = await waitForServerStopped(config, status.pid);
  if (stopped) {
    await clearServerPid(config, status.pid);
  }
  return {
    stopped,
    method: "signal",
    signal: "SIGTERM",
    ...status,
    running: stopped ? false : status.running,
  };
}

export async function writeServerPid(config, pid = process.pid, metadata = {}) {
  const paths = serverPaths(config);
  mkdirSync(dirname(paths.pidPath), { recursive: true });
  await writeFile(paths.pidPath, `${JSON.stringify({
    pid,
    port: config.runtime.port,
    host: config.runtime.host,
    startedAt: new Date().toISOString(),
    ...metadata,
  }, null, 2)}\n`);
  return paths.pidPath;
}

export async function clearServerPid(config, pid = null) {
  const paths = serverPaths(config);
  if (pid) {
    const current = await readServerPid(paths.pidPath);
    if (current.pid && current.pid !== pid) {
      return false;
    }
  }
  await rm(paths.pidPath, { force: true });
  return true;
}

export function serverPaths(config) {
  const home = expandHome(config.runtime.home);
  return {
    logPath: join(home, "server.log"),
    pidPath: join(home, "server.pid"),
  };
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

async function waitForServerStopped(config, pid) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await serverHealth(config);
    if (!health.ok && !pidAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function requestServerStop(config) {
  try {
    const response = await fetch(`${serverUrl(config)}/api/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return false;
    }
  } catch {
    return false;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await serverHealth(config);
    if (!health.ok) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function readServerPid(pidPath) {
  try {
    const metadata = JSON.parse(await readFile(pidPath, "utf8"));
    const pid = Number(metadata.pid || 0);
    return { pid: pid || null, alive: pid ? pidAlive(pid) : false, metadata };
  } catch {
    return { pid: null, alive: false, metadata: null };
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortInUse(config) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: config.runtime.host, port: config.runtime.port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(300, () => done(false));
  });
}

export function serverUrl(config) {
  return `http://${config.runtime.host}:${config.runtime.port}`;
}

export function publicServerUrl(config) {
  return config.runtime.publicUrl || serverUrl(config);
}
