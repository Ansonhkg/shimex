import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function buildInviteUrl(advertiseUrl, displayCode) {
  const origin = String(advertiseUrl || "").replace(/\/+$/, "");
  const code = String(displayCode || "").split("@")[0];
  if (!origin || !code) {
    return "";
  }
  return `${origin}/join?c=${encodeURIComponent(code)}`;
}

export function buildInviteOneLiner(inviteUrl) {
  if (!inviteUrl) return "";
  // Opens the setup script path with the same code query.
  const setupUrl = inviteUrl.replace("/join?", "/join/setup.sh?");
  return `curl -fsSL '${setupUrl}' | bash`;
}

export async function preparePairingShareCard({ displayCode, advertiseUrl, expiresAt, hostLabel = "Shimex host", inviteUrl = "" }) {
  const dir = join(tmpdir(), "shimex-pair");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `shimex-pair-${stamp}.txt`);
  const resolvedInvite = inviteUrl || buildInviteUrl(advertiseUrl, displayCode);
  const oneLiner = buildInviteOneLiner(resolvedInvite);
  const body = [
    "Shimex pairing invite",
    "=====================",
    "",
    "Run this ONE command on the client:",
    "",
    oneLiner,
    "",
    "That pairs with the host, installs Shimex if needed, and opens the managed app.",
    "",
    "Invite link:",
    resolvedInvite,
    "",
    "Fallback code:",
    displayCode,
    "",
    `Host: ${advertiseUrl}`,
    expiresAt ? `Expires: ${expiresAt}` : "",
    hostLabel ? `From: ${hostLabel}` : "",
    "",
    "Notes:",
    "- One-time invite",
    "- Client uses host credentials without copying secrets",
    "- Client desktop setup needs original Codex.app installed once",
    "",
  ].filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
  await writeFile(path, `${body}\n`, "utf8");
  return { path, body, displayCode, inviteUrl: resolvedInvite, oneLiner };
}

export async function copyTextToClipboard(text) {
  if (process.platform !== "darwin") {
    return { copied: false, reason: "clipboard-unsupported" };
  }
  try {
    await runWithStdin("/usr/bin/pbcopy", [], String(text || ""));
    return { copied: true };
  } catch (error) {
    return { copied: false, reason: String(error?.message || error) };
  }
}

export async function shareFileViaAirDrop(path) {
  if (process.platform !== "darwin") {
    return { shared: false, reason: "airdrop-unsupported" };
  }
  const script = [
    'use framework "AppKit"',
    "use scripting additions",
    `set theURL to current application's NSURL's fileURLWithPath:"${escapeAppleScriptString(path)}"`,
    "set sharingService to current application's NSSharingService's sharingServiceNamed:(current application's NSSharingServiceNameSendViaAirDrop)",
    "if sharingService is missing value then error \"AirDrop sharing service unavailable\"",
    "sharingService's performWithItems:{theURL}",
  ].join("\n");
  try {
    await run("/usr/bin/osascript", ["-e", script]);
    return { shared: true, method: "airdrop-share-sheet" };
  } catch (error) {
    // Fallback: reveal the invite file so the user can AirDrop from Finder.
    try {
      await run("/usr/bin/open", ["-R", path]);
      return {
        shared: false,
        revealed: true,
        reason: String(error?.message || error),
        method: "reveal-in-finder",
      };
    } catch (revealError) {
      return {
        shared: false,
        revealed: false,
        reason: `${String(error?.message || error)}; reveal failed: ${String(revealError?.message || revealError)}`,
      };
    }
  }
}

function escapeAppleScriptString(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

function runWithStdin(command, args, stdinText) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
    child.stdin.end(stdinText);
  });
}
