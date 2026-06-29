#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createServer } from "../server/httpServer.js";
import { loadShimexConfig } from "../core/config.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { listProviderManifests } from "../providers/index.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";
import { installCodexClient, openCodexClient, startCodexClient, syncCodexClient } from "../clients/codex/lifecycle.js";
import { clearServerPid, serverStatus, stopServer, writeServerPid } from "../server/process.js";

const commands = {
  help: runHelp,
  version: runVersion,
  start: runStart,
  dev: runDev,
  status: runStatus,
  stop: runStop,
  doctor: runDoctor,
  install: runInstall,
  sync: runSync,
  open: runOpen,
  providers: runProviders,
  models: runModels,
  catalog: runCatalog,
  server: runServer,
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
  shimex dev
  shimex status
  shimex stop
  shimex providers list
  shimex models list
  shimex server start [--port <port>]

commands:
  help                 Show help
  version              Show version
  start                Prepare and open the managed Shimex.app
  dev                  Run the server in the foreground and open Shimex.app
  status               Show Shimex backend status
  stop                 Stop the detached Shimex backend
  doctor               Check Codex Desktop prerequisite and Shimex config
  install              Plan managed Shimex.app install; use --apply to write
  sync                 Plan managed Shimex.app resync; use --apply to write
  open                 Open the managed Shimex.app
  providers list       List registered providers
  models list          List discovered models
  catalog print        Print the generated Codex model catalog
  server start         Start the local HTTP/admin server`);
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
  if (args[0] !== "start") {
    console.error("usage: shimex server start [--port <port>]");
    return 2;
  }
  const config = await loadShimexConfig();
  const port = readFlag(args, "--port");
  if (port) {
    config.runtime.port = Number(port);
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
