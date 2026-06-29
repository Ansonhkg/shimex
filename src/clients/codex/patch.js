import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
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
const ICON_CANVAS_SIZE = 1024;
const ICON_TILE_MARGIN = 0;
const ICON_TILE_RADIUS = 220;
const ICON_ARTWORK_SIZE = 1060;
const ICON_ARTWORK_OFFSET_X = 62;
const ICON_ARTWORK_OFFSET_Y = 10;

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

  await makeManagedAppWritable(paths.managedApp);
  const runtimeHome = expandHome(config.runtime.home);
  await mkdir(runtimeHome, { recursive: true });
  await backupOnce(appAsar, join(runtimeHome, APP_ASAR_BACKUP_NAME));
  await backupOnce(infoPlist, join(runtimeHome, INFO_PLIST_BACKUP_NAME));
  await backupOnce(appAsar, join(runtimeHome, `${APP_ASAR_BACKUP_NAME}.${(await fileHash(appAsar)).slice(0, 12)}`));
  await updateManagedBundleMetadata(config, infoPlist);
  const iconPatch = await updateManagedAppIcon(config, paths.managedApp, infoPlist);

  const workdir = join(runtimeHome, "app-asar-work");
  await rm(workdir, { recursive: true, force: true });
  await mkdir(workdir, { recursive: true });
  await run("npx", ["--yes", "asar", "extract", appAsar, workdir]);
  const changed = await patchExtractedBundles(workdir);
  if (!changed.changed) {
    if (iconPatch.changed) {
      await signManagedApp(paths.managedApp);
      return { patched: true, appAsar, infoPlist, icon: iconPatch, bundleReason: changed.reason || "already-patched" };
    }
    return { patched: false, reason: changed.reason || "already-patched", icon: iconPatch };
  }
  await run("npx", ["--yes", "asar", "pack", workdir, appAsar]);
  await updateAsarIntegrity(appAsar, infoPlist);
  await signManagedApp(paths.managedApp);
  return { patched: true, appAsar, infoPlist, icon: iconPatch };
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
  await refreshLaunchServicesRegistration(managedApp);
}

async function refreshLaunchServicesRegistration(managedApp) {
  await runOptional("touch", ["-c", managedApp]);
  await runOptional("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", managedApp]);
}

async function makeManagedAppWritable(managedApp) {
  for (const attribute of ["com.apple.provenance", "com.apple.quarantine"]) {
    await runOptional("xattr", ["-dr", attribute, managedApp]);
  }
}

async function updateManagedAppIcon(config, managedApp, infoPlist) {
  const iconPath = config.codex.iconPath;
  if (!iconPath || !await exists(iconPath)) {
    return { changed: false, reason: "icon-source-missing", iconPath };
  }
  const resources = join(managedApp, "Contents", "Resources");
  if (!await exists(resources)) {
    return { changed: false, reason: "resources-dir-missing", iconPath };
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "shimex-icns-"));
  const normalizedIconPath = join(tempRoot, "normalized-icon.png");
  const tempIcns = join(tempRoot, "app.icns");
  const icnsPath = join(resources, "app.icns");
  try {
    const normalized = await normalizeIconPng(iconPath, normalizedIconPath);
    const sourceForBundle = normalized ? normalizedIconPath : iconPath;
    await copyPngIcons(sourceForBundle, resources);
    await generateIcns(sourceForBundle, tempIcns);
    for (const name of ["app.icns", "electron.icns"]) {
      await cp(tempIcns, join(resources, name));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  await setBundleIcon(infoPlist, "app");
  return { changed: true, iconPath, icnsPath };
}

async function updateManagedBundleMetadata(config, infoPlist) {
  const name = config.codex.managedAppName || "Shimex";
  const bundleIdentifier = config.codex.bundleIdentifier || "xyz.shimex.app";
  await setPlistString(infoPlist, "CFBundleName", name);
  await setPlistString(infoPlist, "CFBundleDisplayName", name);
  await setPlistString(infoPlist, "CFBundleIdentifier", bundleIdentifier);
}

async function copyPngIcons(iconPath, resources) {
  const targets = [
    "icon.png",
    "icon-codex-dark-color.png",
    "icon-codex-light.png",
    join("default_app", "icon.png"),
  ];
  for (const target of targets) {
    const path = join(resources, target);
    await mkdir(dirname(path), { recursive: true });
    await cp(iconPath, path);
  }
}

async function generateIcns(iconPath, outputPath) {
  const root = await mkdtemp(join(tmpdir(), "shimex-icon-"));
  const sizes = [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ];
  try {
    const chunks = [];
    for (const [type, size] of sizes) {
      const pngPath = join(root, `${size}.png`);
      await resizePng(iconPath, pngPath, size);
      chunks.push(icnsChunk(type, await readFile(pngPath)));
    }
    await writeFile(outputPath, icnsFile(chunks));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function normalizeIconPng(iconPath, outputPath) {
  if (!await commandAvailable("magick")) {
    return false;
  }
  const root = await mkdtemp(join(tmpdir(), "shimex-normalized-icon-"));
  const backgroundPath = join(root, "background.png");
  const artworkPath = join(root, "artwork.png");
  try {
    await run("magick", [
      "-size",
      `${ICON_CANVAS_SIZE}x${ICON_CANVAS_SIZE}`,
      "xc:none",
      "-colorspace",
      "sRGB",
      "-type",
      "TrueColorAlpha",
      "-fill",
      "rgba(255,255,255,1)",
      "-draw",
      `roundrectangle ${ICON_TILE_MARGIN},${ICON_TILE_MARGIN} ${ICON_CANVAS_SIZE - ICON_TILE_MARGIN},${ICON_CANVAS_SIZE - ICON_TILE_MARGIN} ${ICON_TILE_RADIUS},${ICON_TILE_RADIUS}`,
      `PNG32:${backgroundPath}`,
    ]);
    await run("magick", [
      iconPath,
      "-alpha",
      "on",
      "-trim",
      "+repage",
      "-resize",
      `${ICON_ARTWORK_SIZE}x${ICON_ARTWORK_SIZE}`,
      `PNG32:${artworkPath}`,
    ]);
    await run("magick", [
      backgroundPath,
      "(",
      artworkPath,
      ")",
      "-gravity",
      "center",
      "-geometry",
      `${signedOffset(ICON_ARTWORK_OFFSET_X)}${signedOffset(ICON_ARTWORK_OFFSET_Y)}`,
      "-compose",
      "over",
      "-composite",
      `PNG32:${outputPath}`,
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  return true;
}

function signedOffset(value) {
  return value < 0 ? String(value) : `+${value}`;
}

function icnsFile(chunks) {
  const totalLength = 8 + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(totalLength, 4);
  return Buffer.concat([header, ...chunks], totalLength);
}

function icnsChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length);
  chunk.write(type, 0, "ascii");
  chunk.writeUInt32BE(chunk.length, 4);
  data.copy(chunk, 8);
  return chunk;
}

async function resizePng(iconPath, outputPath, size) {
  if (await commandAvailable("magick")) {
    await run("magick", [
      iconPath,
      "-resize",
      `${size}x${size}`,
      "-background",
      "none",
      "-gravity",
      "center",
      "-extent",
      `${size}x${size}`,
      `PNG32:${outputPath}`,
    ]);
    return;
  }
  await run("sips", ["-s", "format", "png", "-z", String(size), String(size), iconPath, "--out", outputPath]);
}

async function setBundleIcon(infoPlist, iconName) {
  await setPlistString(infoPlist, "CFBundleIconFile", iconName);
  await deletePlistKey(infoPlist, "CFBundleIconName");
}

async function setPlistString(infoPlist, key, value) {
  await run("plutil", ["-convert", "xml1", infoPlist]);
  const text = await readFile(infoPlist, "utf8");
  const escapedValue = escapeXml(value);
  const pattern = new RegExp(`(<key>${escapeRegExp(key)}<\\/key>\\s*<string>)([^<]*)(<\\/string>)`);
  if (pattern.test(text)) {
    await writeFile(infoPlist, text.replace(pattern, `$1${escapedValue}$3`));
    return;
  }
  await writeFile(infoPlist, text.replace("</dict>", `  <key>${key}</key>\n  <string>${escapedValue}</string>\n</dict>`));
}

async function deletePlistKey(infoPlist, key) {
  await run("plutil", ["-convert", "xml1", infoPlist]);
  const text = await readFile(infoPlist, "utf8");
  const pattern = new RegExp(`\\s*<key>${escapeRegExp(key)}<\\/key>\\s*<[^>]+>[^<]*<\\/[^>]+>`);
  await writeFile(infoPlist, text.replace(pattern, ""));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function runOptional(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
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
