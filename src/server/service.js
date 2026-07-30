import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { expandHome, projectRoot } from "../core/paths.js";
import { ensureServerRunning, publicServerUrl, serverHealth, serverStatus, serverUrl, stopServer } from "./process.js";

export const HOST_SERVICE_LABEL = "xyz.shimex.gateway";

export function planHostService(config, options = {}) {
  const root = options.projectRoot || projectRoot();
  const userHome = options.home || homedir();
  const label = options.label || HOST_SERVICE_LABEL;
  const plistPath = join(userHome, "Library", "LaunchAgents", `${label}.plist`);
  const runtimeHome = expandHome(config.runtime.home);
  const uid = Number(options.uid ?? process.getuid?.());
  const domain = `gui/${uid}`;
  return {
    label,
    domain,
    target: `${domain}/${label}`,
    plistPath,
    runtimeHome,
    logPath: join(runtimeHome, "server.log"),
    nodePath: options.nodePath || stableNodePath(),
    mainPath: join(root, "src", "cli", "main.js"),
    projectRoot: root,
    adminUrl: `${serverUrl(config)}/admin`,
    originalCodexUntouched: true,
  };
}

export function buildLaunchAgentPlist(plan, options = {}) {
  const inheritedPath = options.path || process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${xmlEscape(plan.label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${xmlEscape(plan.nodePath)}</string>`,
    `    <string>${xmlEscape(plan.mainPath)}</string>`,
    "    <string>server</string>",
    "    <string>start</string>",
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${xmlEscape(plan.projectRoot)}</string>`,
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>PATH</key>",
    `    <string>${xmlEscape(inheritedPath)}</string>`,
    "    <key>SHIMEX_SERVICE_MANAGED</key>",
    "    <string>1</string>",
    "  </dict>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>ProcessType</key>",
    "  <string>Background</string>",
    "  <key>ThrottleInterval</key>",
    "  <integer>5</integer>",
    "  <key>ExitTimeOut</key>",
    "  <integer>10</integer>",
    "  <key>StandardOutPath</key>",
    `  <string>${xmlEscape(plan.logPath)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${xmlEscape(plan.logPath)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export async function installHostService(config, options = {}) {
  assertMacOS(options.platform);
  const plan = planHostService(config, options);
  const execute = options.run || runCommand;
  const launchctl = options.launchctl || "/bin/launchctl";

  await execute(launchctl, ["bootout", plan.target]).catch(() => null);
  await stopServer(config);

  await mkdir(dirname(plan.plistPath), { recursive: true });
  await mkdir(plan.runtimeHome, { recursive: true });
  const temporaryPath = `${plan.plistPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, buildLaunchAgentPlist(plan, options), { mode: 0o644 });
  await rename(temporaryPath, plan.plistPath);
  await chmod(plan.plistPath, 0o644).catch(() => {});

  await bootstrapHostService(plan, { ...options, run: execute, launchctl });
  const health = await waitForHealthy(config, options);
  return {
    installed: true,
    running: health.ok,
    plan,
    health,
  };
}

export async function removeHostService(config, options = {}) {
  assertMacOS(options.platform);
  const plan = planHostService(config, options);
  const execute = options.run || runCommand;
  const launchctl = options.launchctl || "/bin/launchctl";
  const bootout = await execute(launchctl, ["bootout", plan.target])
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, reason: String(error?.message || error) }));
  await rm(plan.plistPath, { force: true });
  const backend = await stopServer(config);
  return {
    removed: true,
    running: false,
    plan,
    bootout,
    backend,
  };
}

export async function hostServiceStatus(config, options = {}) {
  const plan = planHostService(config, options);
  const execute = options.run || runCommand;
  const launchctl = options.launchctl || "/bin/launchctl";
  const installed = await pathExists(plan.plistPath);
  let loaded = false;
  if ((options.platform || process.platform) === "darwin") {
    loaded = await execute(launchctl, ["print", plan.target]).then(() => true).catch(() => false);
  }
  return {
    installed,
    loaded,
    plan,
    backend: await serverStatus(config),
  };
}


export async function restartHostService(config, options = {}) {
  const status = await hostServiceStatus(config, options);
  const execute = options.run || runCommand;
  const launchctl = options.launchctl || "/bin/launchctl";

  // Preferred path: kick the LaunchAgent so launchd owns restart lifecycle.
  if (status.loaded) {
    await execute(launchctl, ["kickstart", "-k", status.plan.target]);
    const health = await waitForHealthy(config, options);
    return {
      restarted: true,
      method: "launchctl-kickstart",
      plan: status.plan,
      health,
      service: {
        installed: status.installed,
        loaded: true,
        label: status.plan.label,
      },
      backend: await serverStatus(config),
    };
  }

  // Fallback when no persistent host service is loaded: restart backend only.
  const stopped = await stopServer(config);
  const started = await ensureServerRunning(config);
  const health = await waitForHealthy(config, options);
  return {
    restarted: true,
    method: "backend-restart",
    plan: status.plan,
    stopped,
    started,
    health,
    service: {
      installed: status.installed,
      loaded: false,
      label: status.plan.label,
    },
    backend: await serverStatus(config),
  };
}

export async function bootstrapHostService(plan, options = {}) {
  const execute = options.run || runCommand;
  const launchctl = options.launchctl || "/bin/launchctl";
  const attempts = Number(options.bootstrapAttempts || 20);
  const delayMs = Number(options.bootstrapDelayMs || 250);
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await execute(launchctl, ["bootstrap", plan.domain, plan.plistPath]);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
  await execute(launchctl, ["enable", plan.target]);
  await execute(launchctl, ["kickstart", "-k", plan.target]);
}

async function waitForHealthy(config, options = {}) {
  const attempts = Number(options.healthAttempts || 100);
  const delayMs = Number(options.healthDelayMs || 100);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await serverHealth(config);
    if (health.ok) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Shimex host service did not become healthy at ${publicServerUrl(config)}`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertMacOS(platform = process.platform) {
  if (platform !== "darwin") {
    throw new Error("Persistent Shimex host service is currently supported on macOS only.");
  }
}

function stableNodePath() {
  const major = String(process.versions.node || "").split(".")[0];
  const candidates = [
    major ? `/opt/homebrew/opt/node@${major}/bin/node` : "",
    "/opt/homebrew/bin/node",
    major ? `/usr/local/opt/node@${major}/bin/node` : "",
    "/usr/local/bin/node",
    process.execPath,
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || process.execPath;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}
