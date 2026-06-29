#!/usr/bin/env bun
import { createServer } from "../server/httpServer.js";
import { loadShimexConfig } from "../core/config.js";
import { discoverModels } from "../core/modelDiscovery.js";
import { listProviderManifests } from "../providers/index.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { generateCodexCatalog } from "../clients/codex/catalog.js";

const commands = {
  help: runHelp,
  version: runVersion,
  doctor: runDoctor,
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
  shimex doctor
  shimex providers list
  shimex models list
  shimex server start [--port <port>]

commands:
  help                 Show help
  version              Show version
  doctor               Check Codex Desktop prerequisite and Shimex config
  providers list       List registered providers
  models list          List discovered models
  catalog print        Print the generated Codex model catalog
  server start         Start the local HTTP/admin server`);
  return 0;
}

async function runVersion() {
  const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
  console.log(pkg.version);
  return 0;
}

async function runDoctor() {
  const config = await loadShimexConfig();
  const report = await codexDoctor(config);
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
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
  const server = await createServer(config);
  console.log(`Shimex listening on http://${server.hostname}:${server.port}/admin`);
  await new Promise(() => {});
  return 0;
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return "";
  }
  return args[index + 1] || "";
}

const exitCode = await main(Bun.argv.slice(2));
process.exit(exitCode);
