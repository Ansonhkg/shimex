import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { generateCodexCatalog } from "../clients/codex/catalog.js";
import { codexDoctor } from "../clients/codex/doctor.js";
import { installCodexClient, openCodexClient, writeCodexProfile } from "../clients/codex/lifecycle.js";
import { resolveCodexPaths } from "../clients/codex/paths.js";
import {
  parseDisplayCode,
  readClientSession,
  readModeStore,
  writeClientSession,
  writeModeStore,
} from "./pairing.js";

export async function pairWithHost(config, displayCode, options = {}) {
  const parsed = parseDisplayCode(displayCode);
  if (!parsed.code) {
    throw new Error("Pairing code is required.");
  }
  const gatewayUrl = parsed.gatewayUrl || String(options.gatewayUrl || "").replace(/\/+$/, "");
  if (!gatewayUrl) {
    throw new Error("Pairing code must include host, e.g. ABCD-EFGH@shimex-host.tailnet.example:5413");
  }
  const response = await (options.fetch || fetch)(`${gatewayUrl}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      displayCode: parsed.gatewayUrl ? displayCode : `${parsed.code}@${new URL(gatewayUrl).host}`,
      clientLabel: options.clientLabel || options.label || hostnameLabel(),
      hostLabel: options.hostLabel || "",
    }),
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Pairing failed with HTTP ${response.status}`);
  }
  if (!payload.clientToken || !payload.gatewayUrl) {
    throw new Error("Host pairing response was missing clientToken/gatewayUrl.");
  }
  const saved = await writeClientSession(config, {
    gatewayUrl: payload.gatewayUrl,
    clientToken: payload.clientToken,
    clientId: payload.clientId || "",
    hostLabel: payload.hostLabel || "",
    scopes: payload.scopes || ["models:use", "catalog:read"],
    pairedAt: payload.pairedAt || new Date().toISOString(),
  });
  await writeModeStore(config, "client");
  return {
    ok: true,
    session: saved.session,
    path: saved.path,
  };
}

export async function clientStatus(config, options = {}) {
  const mode = await readModeStore(config);
  const session = await readClientSession(config);
  if (!session) {
    return {
      mode: mode.mode,
      paired: false,
      session: null,
      host: null,
    };
  }
  const host = await probeHost(session, options).catch((error) => ({
    ok: false,
    error: String(error?.message || error),
  }));
  return {
    mode: mode.mode,
    paired: true,
    session: {
      gatewayUrl: session.gatewayUrl,
      clientId: session.clientId,
      hostLabel: session.hostLabel,
      scopes: session.scopes,
      pairedAt: session.pairedAt,
      updatedAt: session.updatedAt,
      // never include full token in status output
      tokenPrefix: String(session.clientToken || "").slice(0, 8),
    },
    host,
  };
}

export async function setupClientDesktop(config, options = {}) {
  const session = options.session || await readClientSession(config);
  if (!session) {
    throw new Error("No paired client session. Run `shimex pair <code>` first.");
  }

  const models = options.models || await fetchHostModels(session, options);
  if (!models.length) {
    throw new Error("Host returned no models.");
  }

  const remoteConfig = remoteGatewayConfig(config, session);
  const doctor = await codexDoctor(remoteConfig);
  let install = null;
  let transferred = null;

  // Prefer local Codex when present. Never host-transfer in that case.
  if (doctor.sourceCodexApp.exists) {
    install = await installCodexClient(remoteConfig, {
      apply: options.apply !== false,
      models,
    });
    transferred = { ok: true, source: "local-codex", skippedHostTransfer: true };
  } else {
    // Fallback only: download managed Shimex.app from the paired host.
    transferred = await transferManagedAppFromHost(remoteConfig, session, options);
    if (!transferred.ok) {
      return {
        ok: false,
        reason: transferred.reason || "desktop-transfer-failed",
        doctor,
        message: transferred.message || "Could not transfer managed Shimex.app from host.",
        fallback: {
          baseUrl: `${session.gatewayUrl}/v1`,
          authorization: "Bearer <client-token>",
          note: "Use any OpenAI-compatible client against the host gateway.",
        },
        transferred,
      };
    }
  }

  // Always write remote-pointed profile/auth/catalog after app is present.
  const profile = await writeClientRemoteProfile(remoteConfig, session, models);
  let opened = null;
  if (options.open) {
    opened = await openCodexClient(remoteConfig, options.args || []);
  }
  return {
    ok: true,
    doctor: await codexDoctor(remoteConfig),
    install,
    transferred,
    profile,
    opened,
    gatewayUrl: session.gatewayUrl,
    modelCount: models.length,
  };
}

export async function transferManagedAppFromHost(config, session, options = {}) {
  const paths = resolveCodexPaths(config);
  const fetcher = options.fetch || fetch;
  const infoResponse = await fetcher(`${session.gatewayUrl}/api/desktop/bundle`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.clientToken}`,
    },
    signal: options.signal,
  });
  const info = await infoResponse.json().catch(() => ({}));
  if (!infoResponse.ok || !info?.available) {
    return {
      ok: false,
      reason: "host-desktop-bundle-missing",
      message: info?.error?.message || "Host does not have a managed Shimex.app ready to transfer. On host run: npm start (or install/sync).",
      info,
    };
  }

  const download = await fetcher(`${session.gatewayUrl}/api/desktop/shimex.app.tgz`, {
    headers: {
      accept: "application/gzip",
      authorization: `Bearer ${session.clientToken}`,
    },
    signal: options.signal,
  });
  if (!download.ok || !download.body) {
    const payload = await download.json().catch(() => ({}));
    return {
      ok: false,
      reason: "host-desktop-download-failed",
      message: payload?.error?.message || `Host desktop download failed (HTTP ${download.status})`,
    };
  }

  const workdir = join(tmpdir(), `shimex-desktop-${Date.now()}`);
  const archivePath = join(workdir, "Shimex.app.tgz");
  await mkdir(workdir, { recursive: true });
  await mkdir(dirname(paths.managedApp), { recursive: true });

  // Save archive to disk.
  const file = createWriteStream(archivePath);
  await pipeline(Readable.fromWeb(download.body), file);

  // Replace managed app.
  await rm(paths.managedApp, { recursive: true, force: true });
  await runCommand("tar", ["-xzf", archivePath, "-C", dirname(paths.managedApp)]);

  // Ensure executable bits are usable and ad-hoc sign for local launch on macOS.
  if (process.platform === "darwin") {
    await runCommand("chmod", ["-R", "u+rwX", paths.managedApp]).catch(() => {});
    await runCommand("codesign", ["--force", "--deep", "--sign", "-", paths.managedApp]).catch(() => {});
  }

  await rm(workdir, { recursive: true, force: true }).catch(() => {});

  try {
    await access(paths.managedApp);
  } catch {
    return {
      ok: false,
      reason: "host-desktop-extract-failed",
      message: `Downloaded app was not extracted to ${paths.managedApp}`,
    };
  }

  return {
    ok: true,
    source: "host-transfer",
    managedApp: paths.managedApp,
    hostVersion: info.version || "",
    hostBuild: info.build || "",
  };
}

function runCommand(command, args) {
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

export async function fetchHostModels(session, options = {}) {
  const response = await (options.fetch || fetch)(`${session.gatewayUrl}/api/models`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.clientToken}`,
    },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Host /api/models failed with HTTP ${response.status}`);
  }
  return Array.isArray(payload) ? payload : [];
}

export async function fetchHostCatalog(session, options = {}) {
  const response = await (options.fetch || fetch)(`${session.gatewayUrl}/codex/model-catalog.json`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.clientToken}`,
    },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Host catalog failed with HTTP ${response.status}`);
  }
  return payload;
}

export async function syncClientCatalog(config, options = {}) {
  const session = options.session || await readClientSession(config);
  if (!session) {
    throw new Error("No paired client session. Run `shimex pair <code>` first.");
  }
  const catalog = options.catalog || await fetchHostCatalog(session, options);
  if (!Array.isArray(catalog?.models) || !catalog.models.length) {
    throw new Error("Host returned an empty Codex model catalog.");
  }
  const paths = resolveCodexPaths(remoteGatewayConfig(config, session));
  await mkdir(dirname(paths.catalogPath), { recursive: true });
  const temporaryPath = `${paths.catalogPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, paths.catalogPath);
  return {
    ok: true,
    gatewayUrl: session.gatewayUrl,
    catalogPath: paths.catalogPath,
    modelCount: catalog.models.length,
    models: catalog.models.map((model) => model.slug),
  };
}

export function remoteGatewayConfig(config, session) {
  return {
    ...config,
    runtime: {
      ...config.runtime,
      // Profile generation uses publicUrl when present.
      publicUrl: session.gatewayUrl,
      // Keep local loopback for any local helper process checks.
      host: config.runtime?.host || "127.0.0.1",
      skipLocalServer: true,
    },
    codex: {
      ...config.codex,
      localAuthKey: session.clientToken,
      seedLocalAuth: true,
    },
  };
}

async function writeClientRemoteProfile(config, session, models) {
  const profile = await writeCodexProfile(config, models);
  // Belt-and-suspenders: rewrite auth with client token and ensure catalog exists.
  const paths = resolveCodexPaths(config);
  await writeFile(paths.catalogPath, `${JSON.stringify(generateCodexCatalog(models), null, 2)}\n`);
  await writeFile(paths.authPath, `${JSON.stringify({
    auth_mode: "apikey",
    OPENAI_API_KEY: session.clientToken,
    tokens: null,
    last_refresh: null,
  }, null, 2)}\n`, { mode: 0o600 });
  return {
    ...profile,
    authMode: "client-token",
    gatewayUrl: session.gatewayUrl,
  };
}

async function probeHost(session, options = {}) {
  const health = await (options.fetch || fetch)(`${session.gatewayUrl}/health`, {
    headers: { accept: "application/json" },
    signal: options.signal || AbortSignal.timeout(1500),
  });
  const healthJson = await health.json().catch(() => ({}));
  const modelsResponse = await (options.fetch || fetch)(`${session.gatewayUrl}/v1/models`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.clientToken}`,
    },
    signal: options.signal || AbortSignal.timeout(2500),
  });
  const modelsJson = await modelsResponse.json().catch(() => ({}));
  return {
    ok: health.ok && modelsResponse.ok,
    health: healthJson,
    modelsHttp: modelsResponse.status,
    modelCount: Array.isArray(modelsJson?.data) ? modelsJson.data.length : null,
  };
}

function hostnameLabel() {
  try {
    return process.env.HOST || process.env.HOSTNAME || "client";
  } catch {
    return "client";
  }
}
