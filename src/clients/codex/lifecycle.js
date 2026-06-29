import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { discoverModels } from "../../core/modelDiscovery.js";
import { ensureServerRunning } from "../../server/process.js";
import { generateCodexCatalog } from "./catalog.js";
import { codexDoctor } from "./doctor.js";
import { patchManagedCodexApp } from "./patch.js";
import { codexConfigText, resolveCodexPaths } from "./paths.js";

export async function planCodexInstall(config) {
  const paths = resolveCodexPaths(config);
  const sourceMetadata = await readCodexAppMetadata(paths.sourceApp);
  const managedMetadata = await readCodexAppMetadata(paths.managedApp);
  const sourceExists = sourceMetadata.exists;
  const managedExists = managedMetadata.exists;
  return {
    ok: sourceExists,
    applyRequired: true,
    action: managedExists ? "replace-managed-app-and-profile" : "create-managed-app-and-profile",
    sourceCodexApp: sourceMetadata,
    managedShimexApp: managedMetadata,
    profileHome: paths.profileHome,
    userDataDir: paths.userDataDir,
    catalogPath: paths.catalogPath,
    configPath: paths.configPath,
    writes: [
      { type: "copy", from: paths.sourceApp, to: paths.managedApp },
      { type: "write", path: paths.catalogPath },
      { type: "write", path: paths.configPath },
    ],
    originalCodexUntouched: true,
  };
}

export async function installCodexClient(config, options = {}) {
  const plan = await planCodexInstall(config);
  if (!options.apply) {
    return { applied: false, plan };
  }
  assertInstallPlanSafe(plan);
  const models = options.models || await discoverModels(config);
  await copyManagedApp(plan.sourceCodexApp.path, plan.managedShimexApp.path);
  const patch = await patchManagedCodexApp(config);
  await writeCodexProfile(config, models);
  return {
    applied: true,
    patch,
    plan: await planCodexInstall(config),
    doctor: await codexDoctor(config),
  };
}

export async function syncCodexClient(config, options = {}) {
  return installCodexClient(config, options);
}

export async function writeCodexProfile(config, models = null) {
  const resolvedModels = models || await discoverModels(config);
  if (!resolvedModels.length) {
    throw new Error("Cannot write Codex profile without at least one Shimex model.");
  }
  const paths = resolveCodexPaths(config);
  await mkdir(dirname(paths.catalogPath), { recursive: true });
  await mkdir(paths.profileHome, { recursive: true });
  await writeFile(paths.catalogPath, `${JSON.stringify(generateCodexCatalog(resolvedModels), null, 2)}\n`);
  await writeFile(paths.configPath, codexConfigText(config, resolvedModels[0].slug));
  return {
    catalogPath: paths.catalogPath,
    configPath: paths.configPath,
    defaultModel: resolvedModels[0].slug,
  };
}

export async function openCodexClient(config, args = []) {
  const paths = resolveCodexPaths(config);
  const doctor = await codexDoctor(config);
  if (!doctor.managedShimexApp.exists) {
    throw new Error(`Managed Shimex app does not exist: ${paths.managedApp}`);
  }
  const server = await ensureServerRunning(config);
  const child = spawn(
    "open",
    [
      "-n",
      "-a",
      paths.managedApp,
      "--args",
      `--user-data-dir=${paths.userDataDir}`,
      ...args,
    ],
    {
      env: {
        ...process.env,
        CODEX_HOME: paths.profileHome,
        NO_PROXY: prependLoopbackNoProxy(process.env.NO_PROXY),
        no_proxy: prependLoopbackNoProxy(process.env.no_proxy),
      },
      stdio: "ignore",
      detached: true,
    },
  );
  child.unref();
  return {
    opened: true,
    server,
    managedApp: paths.managedApp,
    profileHome: paths.profileHome,
    userDataDir: paths.userDataDir,
  };
}

async function copyManagedApp(sourceApp, managedApp) {
  assertManagedAppPath(managedApp);
  await mkdir(dirname(managedApp), { recursive: true });
  await rm(managedApp, { recursive: true, force: true });
  await cp(sourceApp, managedApp, { recursive: true, preserveTimestamps: true });
}

function assertInstallPlanSafe(plan) {
  if (!plan.sourceCodexApp.exists) {
    throw new Error(`Source Codex app not found: ${plan.sourceCodexApp.path}`);
  }
  if (plan.sourceCodexApp.path === plan.managedShimexApp.path) {
    throw new Error("Managed Shimex app path must not equal the source Codex app path.");
  }
  assertManagedAppPath(plan.managedShimexApp.path);
}

function assertManagedAppPath(path) {
  if (!path.endsWith(".app")) {
    throw new Error(`Managed app path must end with .app: ${path}`);
  }
  if (basename(path) !== "Shimex.app") {
    throw new Error(`Managed app path must be named Shimex.app: ${path}`);
  }
}

export async function readCodexAppMetadata(appPath) {
  try {
    const stats = await stat(appPath);
    return {
      path: appPath,
      exists: true,
      version: await readPlistString(appPath, "CFBundleShortVersionString"),
      build: await readPlistString(appPath, "CFBundleVersion"),
      modifiedAt: stats.mtime.toISOString(),
    };
  } catch {
    return {
      path: appPath,
      exists: false,
      version: "",
      build: "",
      modifiedAt: "",
    };
  }
}

async function readPlistString(appPath, key) {
  const plistPath = join(appPath, "Contents", "Info.plist");
  try {
    const text = await readFile(plistPath, "utf8");
    const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<string>([^<]+)</string>`);
    return text.match(pattern)?.[1] || "";
  } catch {
    return "";
  }
}

function prependLoopbackNoProxy(value = "") {
  const prefix = "127.0.0.1,localhost,::1";
  return value ? `${prefix},${value}` : prefix;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
