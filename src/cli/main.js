#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "../server/httpServer.js";
import { loadShimexConfig } from "../core/config.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { listProviderManifests } from "../providers/index.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";
import { installCodexClient, openCodexClient, startCodexClient, syncCodexClient } from "../clients/codex/lifecycle.js";
import { resolveCodexPaths } from "../clients/codex/paths.js";
import { clearServerPid, ensureServerRunning, serverStatus, stopServer, writeServerPid } from "../server/process.js";
import { loadAuthStore } from "../providers/chatgpt-codex/index.js";
import {
  authStorePath,
  listProfileSummaries,
  maskAccountId,
  removeProfile,
  setDefaultProfile,
  upsertProfile,
  writeCodexAuths,
} from "../providers/chatgpt-codex/authStore.js";
import { runExec } from "./exec.js";
import { expandHome } from "../core/paths.js";

const commands = {
  help: runHelp,
  version: runVersion,
  start: runStart,
  dev: runDev,
  exec: runExec,
  status: runStatus,
  stop: runStop,
  "stop-all": runStopAll,
  doctor: runDoctor,
  install: runInstall,
  sync: runSync,
  open: runOpen,
  providers: runProviders,
  models: runModels,
  catalog: runCatalog,
  server: runServer,
  "codex-auth": runCodexAuth,
};

async function main(argv) {
  const [command = "help", ...rest] = argv;
  const handler = commands[command];
  if (!handler) {
    console.error(`unknown command: ${command}`);
    runHelp();
    return 2;
  }
  return await handler(rest);
}

function runHelp() {
  console.log(`usage:
  shimex <command>

start here:
  shimex start
  shimex exec [--model <slug-or-display-name>] [prompt]
  shimex dev
  shimex status
  shimex stop
  shimex stop-all
  shimex providers list
  shimex models list
  shimex server start [--port <port>]
  shimex server ensure
  shimex server restart

commands:
  help                       Show help
  version                    Show version
  start                      Prepare and open the managed Shimex.app
  exec                       Send a prompt to a Shimex model. Reads prompt from args or stdin.
  dev                        Run the server in the foreground and open Shimex.app
  status                     Show Shimex backend status
  stop                       Stop the detached Shimex backend
  stop-all                   Stop the backend and quit the managed Shimex.app
  doctor                     Check Codex Desktop prerequisite and Shimex config
  install                    Plan managed Shimex.app install; use --apply to write
  sync                       Plan managed Shimex.app resync; use --apply to write
  open                       Open the managed Shimex.app
  providers list             List registered providers
  models list                List discovered models
  catalog print              Print the generated Codex model catalog
  server start               Start the local HTTP/admin server in the foreground
  server ensure              Start the backend in the background if needed
  server restart             Restart only the background backend
  codex-auth list            List chatgpt-codex auth profiles
  codex-auth add <name>      Paste a chatgpt-codex auth JSON (path, "-" for stdin)
  codex-auth remove <name>   Remove a chatgpt-codex auth profile
  codex-auth use <name>      Set the default chatgpt-codex auth profile
`);
  return 0;
}

async function runVersion() {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
  return 0;
}

async function runDoctor() {
  const config = await loadShimexConfig();
  const report = await codexDoctor(config);
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

async function runStart(args) {
  const config = await loadShimexConfig();
  const result = await startCodexClient(config, args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function runDev(args) {
  const config = await loadShimexConfig();
  const current = await serverStatus(config);
  if (current.running) {
    console.error(`Shimex backend is already running at ${current.url}. Run \`npm run stop\` first, then \`npm run dev\`.`);
    console.error(JSON.stringify(current, null, 2));
    return 1;
  }
  if (current.portInUse) {
    console.error(portInUseMessage(current));
    console.error(JSON.stringify(current, null, 2));
    return 1;
  }
  const server = await createServer(config);
  await writeServerPid(config, process.pid, { mode: "foreground" });
  console.log(`Shimex dev server listening on http://${server.hostname}:${server.port}/admin`);
  const close = async () => {
    await clearServerPid(config, process.pid);
    server.stop();
  };
  process.once("SIGINT", () => close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => close().finally(() => process.exit(0)));
  const result = await startCodexClient(config, args);
  console.log(JSON.stringify(result, null, 2));
  await server.closed;
  await clearServerPid(config, process.pid);
  return 0;
}

async function runStatus() {
  const config = await loadShimexConfig();
  const status = await serverStatus(config);
  console.log(JSON.stringify(status, null, 2));
  return status.running ? 0 : 1;
}

async function runStop() {
  const config = await loadShimexConfig();
  const result = await stopServer(config);
  console.log(JSON.stringify(result, null, 2));
  return result.stopped || result.reason === "server-not-running" ? 0 : 1;
}

async function runStopAll() {
  const config = await loadShimexConfig();
  const backend = await stopServer(config);
  const app = await stopManagedAppProcesses(resolveCodexPaths(config).managedApp);
  const result = { backend, app };
  console.log(JSON.stringify(result, null, 2));
  const backendOk = backend.stopped || backend.reason === "server-not-running";
  return backendOk && app.ok ? 0 : 1;
}

async function runInstall(args) {
  const config = await loadShimexConfig();
  const result = await installCodexClient(config, { apply: hasFlag(args, "--apply") });
  console.log(JSON.stringify(result, null, 2));
  return result.applied || !hasFlag(args, "--apply") ? 0 : 1;
}

async function runSync(args) {
  const config = await loadShimexConfig();
  const result = await syncCodexClient(config, { apply: hasFlag(args, "--apply") });
  console.log(JSON.stringify(result, null, 2));
  return result.applied || !hasFlag(args, "--apply") ? 0 : 1;
}

async function runOpen(args) {
  const config = await loadShimexConfig();
  const result = await openCodexClient(config, args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function runProviders(args) {
  if (args[0] !== "list") {
    console.error("usage: shimex providers list");
    return 2;
  }
  for (const provider of listProviderManifests()) {
    console.log(`${provider.id}\t${provider.displayName}\t${provider.protocol}`);
  }
  return 0;
}

async function runModels(args) {
  if (args[0] !== "list") {
    console.error("usage: shimex models list");
    return 2;
  }
  const config = await loadShimexConfig();
  const models = await discoverModels(config);
  for (const model of models) {
    console.log(`${model.slug}\t${model.providerId}\t${model.inputModalities.join(",")}\t${model.displayName}`);
  }
  return 0;
}

async function runCatalog(args) {
  if (args[0] !== "print") {
    console.error("usage: shimex catalog print");
    return 2;
  }
  const config = await loadShimexConfig();
  const models = await discoverModels(config);
  console.log(JSON.stringify(generateCodexCatalog(models), null, 2));
  return 0;
}

async function runServer(args) {
  const subcommand = args[0];
  if (!subcommand || !["start", "ensure", "restart", "status", "stop"].includes(subcommand)) {
    console.error("usage: shimex server <start|ensure|restart|status|stop> [--port <port>]");
    return 2;
  }
  const config = await loadShimexConfig();
  const port = readFlag(args, "--port");
  if (port) {
    config.runtime.port = Number(port);
  }
  if (subcommand === "status") {
    const status = await serverStatus(config);
    console.log(JSON.stringify(status, null, 2));
    return status.running ? 0 : 1;
  }
  if (subcommand === "stop") {
    const result = await stopServer(config);
    console.log(JSON.stringify(result, null, 2));
    return result.stopped || result.reason === "server-not-running" ? 0 : 1;
  }
  if (subcommand === "ensure") {
    const result = await ensureBackendCanStart(config);
    if (result.error) return 1;
    console.log(JSON.stringify(await ensureServerRunning(config), null, 2));
    return 0;
  }
  if (subcommand === "restart") {
    const stopped = await stopServer(config);
    const startable = await ensureBackendCanStart(config);
    if (startable.error) {
      console.error(JSON.stringify({ stopped, start: startable }, null, 2));
      return 1;
    }
    const started = await ensureServerRunning(config);
    console.log(JSON.stringify({ stopped, started }, null, 2));
    return 0;
  }
  const current = await serverStatus(config);
  if (current.portInUse) {
    console.error(portInUseMessage(current));
    console.error(JSON.stringify(current, null, 2));
    return 1;
  }
  const server = await createServer(config);
  await writeServerPid(config, process.pid, { mode: "foreground" });
  console.log(`Shimex listening on http://${server.hostname}:${server.port}/admin`);
  const close = async () => {
    await clearServerPid(config, process.pid);
    server.stop();
  };
  process.once("SIGINT", () => close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => close().finally(() => process.exit(0)));
  await server.closed;
  await clearServerPid(config, process.pid);
  return 0;
}

async function ensureBackendCanStart(config) {
  const current = await serverStatus(config);
  if (current.portInUse && !current.running) {
    const error = portInUseMessage(current);
    console.error(error);
    console.error(JSON.stringify(current, null, 2));
    return { error, status: current };
  }
  return { ok: true, status: current };
}

async function runCodexAuth(args) {
  const subcommand = args[0];
  if (!subcommand || !["list", "add", "remove", "use"].includes(subcommand)) {
    console.error("usage: shimex codex-auth <list|add|remove|use> [args]");
    return 2;
  }
  const config = await loadShimexConfig();
  const codexProviderConfig = config.providers.find((provider) => provider.id === "chatgpt-codex") || null;
  const store = await loadAuthStore(codexProviderConfig || { id: "chatgpt-codex", options: {} }, config);
  const path = authStorePath(codexProviderConfig || { id: "chatgpt-codex", options: {} }, config);
  if (subcommand === "list") {
    const summaries = listProfileSummaries(store);
    console.log(`path: ${path}`);
    if (!summaries.length) {
      console.log("(no profiles — shimex will fall back to a single auth at ~/.codex/auth.json when present)");
      return 0;
    }
    for (const summary of summaries) {
      const marker = summary.isDefault ? "*" : " ";
      const account = summary.accountMasked ? ` account=${summary.accountMasked}` : "";
      const label = summary.label && summary.label !== summary.name ? ` label=${summary.label}` : "";
      console.log(`${marker} ${summary.name}${account}${label}`);
    }
    return 0;
  }
  if (subcommand === "add") {
    const name = args[1];
    const source = args[2];
    if (!name) {
      console.error("usage: shimex codex-auth add <name> [<auth.json-path>|-]");
      return 2;
    }
    const payloadText = await readCodexAuthInput(source);
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      console.error(`Could not parse auth JSON: ${String(error?.message || error)}`);
      return 1;
    }
    let nextStore;
    let profile;
    try {
      const result = upsertProfile(store, name, payload);
      nextStore = { profiles: result.profiles, defaultProfile: result.defaultProfile };
      profile = result.profile;
    } catch (error) {
      console.error(String(error?.message || error));
      return 1;
    }
    await writeCodexAuths(path, nextStore);
    console.log(`added ${profile.name} (account ${maskAccountId(profile.accountId) || "?"}) to ${path}`);
    return 0;
  }
  if (subcommand === "remove") {
    const name = args[1];
    if (!name) {
      console.error("usage: shimex codex-auth remove <name>");
      return 2;
    }
    const result = removeProfile(store, name);
    await writeCodexAuths(path, { profiles: result.profiles, defaultProfile: result.defaultProfile });
    if (!result.removed) {
      console.error(`profile "${name}" does not exist`);
      return 1;
    }
    console.log(`removed ${result.removed}`);
    return 0;
  }
  if (subcommand === "use") {
    const name = args[1];
    if (!name) {
      console.error("usage: shimex codex-auth use <name>");
      return 2;
    }
    const next = setDefaultProfile(store, name);
    await writeCodexAuths(path, { profiles: next.profiles, defaultProfile: next.defaultProfile });
    if (!next.changed) {
      console.log(`default already ${next.defaultProfile || "(none)"}`);
      return 0;
    }
    console.log(`default -> ${next.defaultProfile}`);
    return 0;
  }
  return 2;
}

async function readCodexAuthInput(source) {
  const fallback = expandHome("~/.codex/auth.json");
  const target = source === "-" ? null : (source ? expandHome(source) : fallback);
  if (!target) {
    return await readAllStdin();
  }
  const text = await readFile(target, "utf8");
  return text;
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { buffer += chunk; });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", reject);
  });
}

async function stopManagedAppProcesses(managedAppPath) {
  const appPath = String(managedAppPath || "");
  if (!appPath) {
    return { ok: false, appPath, error: "managed app path is empty" };
  }
  const processes = await listProcesses();
  const targets = processes.filter((processInfo) => processInfo.command.includes(appPath + "/Contents/"));
  for (const target of targets) {
    try {
      process.kill(target.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        target.error = String(error?.message || error);
      }
    }
  }
  return {
    ok: targets.every((target) => !target.error),
    appPath,
    method: "path-scoped-sigterm",
    count: targets.length,
    pids: targets.map((target) => target.pid),
    errors: targets.flatMap((target) => target.error ? [{ pid: target.pid, error: target.error }] : []),
  };
}

function listProcesses() {
  return new Promise((resolve, reject) => {
    const child = spawn("ps", ["-axo", "pid=,command="], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "ps exited with " + code));
        return;
      }
      resolve(stdout.split(/\r?\n/).flatMap((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        return match ? [{ pid: Number(match[1]), command: match[2] }] : [];
      }));
    });
  });
}
function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return "";
  }
  return args[index + 1] || "";
}

function hasFlag(args, name) {
  return args.includes(name);
}

function portInUseMessage(status) {
  return [
    `Port ${new URL(status.url).port} is already in use, but Shimex health is not responding at ${status.health.url}.`,
    "Run `npm run status` to inspect it, or free that port before starting the foreground dev server.",
  ].join(" ");
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
