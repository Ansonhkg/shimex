import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { discoverModels, refreshProviderModelCaches } from "../../core/modelDiscovery.js";
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
      { type: "write", path: paths.authPath },
      { type: "write", path: paths.globalStatePath },
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
  if (!options.models) {
    await refreshProviderModelCaches(config);
  }
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

export async function startCodexClient(config, args = []) {
  const plan = await planCodexInstall(config);
  const needsAppSync = !plan.managedShimexApp.exists
    || plan.sourceCodexApp.version !== plan.managedShimexApp.version
    || plan.sourceCodexApp.build !== plan.managedShimexApp.build;
  await refreshProviderModelCaches(config);
  const models = await discoverModels(config);
  let sync = null;
  let patch = null;
  let profile = null;
  if (needsAppSync) {
    sync = await syncCodexClient(config, { apply: true, models });
  } else {
    try {
      patch = await patchManagedCodexApp(config);
      profile = await writeCodexProfile(config, models);
    } catch (error) {
      if (!isManagedAppWriteError(error)) {
        throw error;
      }
      sync = await syncCodexClient(config, { apply: true, models });
    }
  }
  const open = await openCodexClient(config, args);
  return {
    started: true,
    sync,
    patch,
    profile,
    open,
  };
}

export async function writeCodexProfile(config, models = null) {
  if (!models) {
    await refreshProviderModelCaches(config);
  }
  const resolvedModels = models || await discoverModels(config);
  if (!resolvedModels.length) {
    throw new Error("Cannot write Codex profile without at least one Shimex model.");
  }
  const paths = resolveCodexPaths(config);
  await mkdir(dirname(paths.catalogPath), { recursive: true });
  await mkdir(paths.profileHome, { recursive: true });
  await writeFile(paths.catalogPath, `${JSON.stringify(generateCodexCatalog(resolvedModels), null, 2)}\n`);
  await writeFile(paths.configPath, codexConfigText(config, resolvedModels[0].slug));
  const auth = await writeCodexAuth(config, paths);
  const desktopState = await writeCodexDesktopState(paths);
  return {
    catalogPath: paths.catalogPath,
    configPath: paths.configPath,
    authPath: auth.path,
    globalStatePath: desktopState.path,
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
        OPENAI_API_KEY: localAuthKey(config),
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

async function writeCodexAuth(config, paths) {
  if (config.codex.seedLocalAuth === false) {
    return { path: paths.authPath, written: false };
  }
  const auth = {
    auth_mode: "apikey",
    OPENAI_API_KEY: localAuthKey(config),
    tokens: null,
    last_refresh: null,
  };
  await writeFile(paths.authPath, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(paths.authPath, 0o600).catch(() => {});
  return { path: paths.authPath, written: true };
}

function localAuthKey(config) {
  return config.codex.localAuthKey || "shimex-local-api-key";
}

async function writeCodexDesktopState(paths) {
  const existing = await readJson(paths.globalStatePath);
  const atomState = {
    ...objectOrEmpty(existing["electron-persisted-atom-state"]),
    "electron:onboarding-hide-first-new-thread-promos": true,
    "electron:onboarding-override": "auto",
    "electron:onboarding-plugin-checklist-active": false,
    "electron:onboarding-primary-runtime-install-ready": true,
    "electron:onboarding-projectless-completed": true,
    "electron:onboarding-welcome-pending": false,
    "electron:onboarding-welcome-v2-role-state": {
      roles: ["default"],
      personalizedSuggestionsEnabled: false,
      workMode: "coding",
    },
    last_completed_onboarding: Math.floor(Date.now() / 1000),
  };
  const state = {
    ...existing,
    "desktop-first-seen-at-ms": existing["desktop-first-seen-at-ms"] || Date.now(),
    "electron-persisted-atom-state": atomState,
  };
  await writeFile(paths.globalStatePath, `${JSON.stringify(state, null, 2)}\n`);
  return { path: paths.globalStatePath, written: true };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function copyManagedApp(sourceApp, managedApp) {
  assertManagedAppPath(managedApp);
  await mkdir(dirname(managedApp), { recursive: true });
  await rm(managedApp, { recursive: true, force: true });
  await run("ditto", ["--noextattr", "--noqtn", sourceApp, managedApp]);
}

function isManagedAppWriteError(error) {
  return error && typeof error === "object" && error.code === "EPERM";
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
