import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { expandHome } from "../../core/paths.js";
import { resolveCodexPaths } from "./paths.js";

const APP_ASAR_BACKUP_NAME = "app.asar.before-shimex-model-picker-patch";
const INFO_PLIST_BACKUP_NAME = "Info.plist.before-shimex-model-picker-patch";
const MODEL_PICKER_PATCH = {
  name: "model-picker-hidden-models",
  already: /function\s+[A-Za-z_$][\w$]*\(\{authMethod:[A-Za-z_$][\w$]*,availableModels:[^}]*?,useHiddenModels:[A-Za-z_$][\w$]*\}\)\{let\s+[A-Za-z_$][\w$]*=\[\],[A-Za-z_$][\w$]*=null,[A-Za-z_$][\w$]*=!1,/,
  match: /(function\s+[A-Za-z_$][\w$]*\(\{authMethod:([A-Za-z_$][\w$]*),availableModels:[^}]*?,useHiddenModels:([A-Za-z_$][\w$]*)\}\)\{let\s+[A-Za-z_$][\w$]*=\[\],[A-Za-z_$][\w$]*=null,)([A-Za-z_$][\w$]*)=\3&&\2!==`amazonBedrock`,/,
  replace: "$1$4=!1,",
};
const SIDEBAR_RECENT_THREADS_PATCH = {
  name: "sidebar-recent-thread-provider-filter",
  already: /async listRecentThreads\(\{cursor:[^}]+?\}\)\{let [A-Za-z_$][\w$]*=\{limit:[^}]*?sortKey:this\.params\.requestClient\.getCompatibleThreadSortKey\(this\.recentConversationSortKey\),modelProviders:\[\],archived:!1,sourceKinds:[A-Za-z_$][\w$]*,useStateDbOnly:[A-Za-z_$][\w$]*\};return this\.params\.requestClient\.sendRequest\(`thread\/list`,[A-Za-z_$][\w$]*\)\}/,
  match: /(async listRecentThreads\(\{cursor:[^}]+?\}\)\{let [A-Za-z_$][\w$]*=\{limit:[^}]*?sortKey:this\.params\.requestClient\.getCompatibleThreadSortKey\(this\.recentConversationSortKey\),)modelProviders:null(,archived:!1,sourceKinds:[A-Za-z_$][\w$]*,useStateDbOnly:[A-Za-z_$][\w$]*\};return this\.params\.requestClient\.sendRequest\(`thread\/list`,[A-Za-z_$][\w$]*\)\})/,
  replace: "$1modelProviders:[]$2",
};
const BUNDLE_PATCHES = [MODEL_PICKER_PATCH, SIDEBAR_RECENT_THREADS_PATCH];

export async function patchManagedCodexApp(config) {
  if (process.platform !== "darwin") {
    return { patched: false, reason: "macos-only" };
  }
  const paths = resolveCodexPaths(config);
  const appAsar = join(paths.managedApp, "Contents", "Resources", "app.asar");
  const infoPlist = join(paths.managedApp, "Contents", "Info.plist");
  if (!await exists(appAsar) || !await exists(infoPlist)) {
    return { patched: false, reason: "managed-app-asar-missing" };
  }

  const runtimeHome = expandHome(config.runtime.home);
  await mkdir(runtimeHome, { recursive: true });
  await backupOnce(appAsar, join(runtimeHome, APP_ASAR_BACKUP_NAME));
  await backupOnce(infoPlist, join(runtimeHome, INFO_PLIST_BACKUP_NAME));
  await backupOnce(appAsar, join(runtimeHome, `${APP_ASAR_BACKUP_NAME}.${(await fileHash(appAsar)).slice(0, 12)}`));

  const workdir = join(runtimeHome, "app-asar-work");
  await rm(workdir, { recursive: true, force: true });
  await mkdir(workdir, { recursive: true });
  await run("npx", ["--yes", "asar", "extract", appAsar, workdir]);
  const changed = await patchExtractedBundles(workdir);
  if (!changed.changed) {
    return { patched: false, reason: changed.reason || "already-patched" };
  }
  await run("npx", ["--yes", "asar", "pack", workdir, appAsar]);
  await updateAsarIntegrity(appAsar, infoPlist);
  await signManagedApp(paths.managedApp);
  return { patched: true, appAsar, infoPlist };
}

export async function patchExtractedBundles(workdir) {
  const assetsDir = join(workdir, "webview", "assets");
  if (!await exists(assetsDir)) {
    return { changed: false, reason: "assets-dir-missing" };
  }
  const files = (await listFiles(assetsDir)).filter((file) => file.endsWith(".js"));
  let changed = false;
  for (const patch of BUNDLE_PATCHES) {
    const result = await replaceInMatchingFile(files, patch);
    if (result === null) {
      return { changed: false, reason: `${patch.name}-missing` };
    }
    changed ||= result;
  }
  return { changed };
}

async function replaceInMatchingFile(files, patch) {
  let sawAlreadyPatched = false;
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    if (patch.already.test(text)) {
      sawAlreadyPatched = true;
      continue;
    }
    const matches = [...text.matchAll(globalRegex(patch.match))];
    if (matches.length === 1) {
      await writeFile(file, text.replace(patch.match, patch.replace));
      return true;
    }
    if (matches.length > 1) {
      throw new Error(`Found multiple ${patch.name} candidates in ${file}`);
    }
  }
  return sawAlreadyPatched ? false : null;
}

function globalRegex(pattern) {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

async function updateAsarIntegrity(appAsar, infoPlist) {
  const hash = await appAsarHeaderHash(appAsar);
  await run("plutil", ["-convert", "xml1", infoPlist]);
  const text = await readFile(infoPlist, "utf8");
  const pattern = /(<key>Resources\/app\.asar<\/key>\s*<dict>[\s\S]*?<key>hash<\/key>\s*<string>)([^<]*)(<\/string>)/;
  if (!pattern.test(text)) {
    throw new Error(`Could not find ElectronAsarIntegrity hash in ${infoPlist}`);
  }
  await writeFile(infoPlist, text.replace(pattern, `$1${hash}$3`));
}

async function signManagedApp(managedApp) {
  // The nested Electron/Chromium frameworks are copied unchanged; signing only
  // the outer app refreshes the local bundle seal for the patched app.asar.
  await run("codesign", ["--force", "--sign", "-", managedApp]);
}

async function appAsarHeaderHash(path) {
  const data = await readFile(path);
  const jsonSize = data.readUInt32LE(12);
  return createHash("sha256").update(data.subarray(16, 16 + jsonSize)).digest("hex");
}

async function backupOnce(source, target) {
  if (await exists(target)) {
    return;
  }
  await cp(source, target);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

function fileHash(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
