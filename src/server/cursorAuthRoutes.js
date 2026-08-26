import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  checkCursorAgentAuth,
  clearCursorAgentAuthCache,
  cursorAgentEnv,
  cursorWorkspace,
  resolveCursorAgentBin,
} from "../providers/cursor-composer/cli.js";
import { cursorComposerProvider } from "../providers/cursor-composer/index.js";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const LOGIN_RETENTION_MS = 15 * 60 * 1000;
const cursorLoginJobs = new Map();

export function createCursorAuthRoutes(config) {
  const cursorProviderConfig = () =>
    (config.providers || []).find((provider) => provider.id === "cursor-composer") || {
      id: "cursor-composer",
      options: {},
    };

  return {
    async route(request, url) {
      const path = url.pathname;
      const method = request.method || "GET";

      if (path === "/api/cursor-auth") {
        if (method !== "GET") return methodNotAllowed(["GET"]);
        return await handleStatus(cursorProviderConfig);
      }
      if (path === "/api/cursor-auth/login") {
        if (method !== "POST") return methodNotAllowed(["POST"]);
        return await startLogin(cursorProviderConfig);
      }
      if (path === "/api/cursor-auth/refresh") {
        if (method !== "POST") return methodNotAllowed(["POST"]);
        return await refreshModels(cursorProviderConfig, config);
      }
      if (path.startsWith("/api/cursor-auth/login/")) {
        if (method !== "GET") return methodNotAllowed(["GET"]);
        const loginId = decodeURIComponent(path.slice("/api/cursor-auth/login/".length));
        return await handleLoginStatus(loginId, cursorProviderConfig);
      }
      return null;
    },
  };
}

async function refreshModels(cursorProviderConfig, config) {
  const providerConfig = cursorProviderConfig();
  const auth = await checkCursorAgentAuth(providerConfig);
  if (!auth.authenticated) {
    return json({
      connected: false,
      reason: auth.reason || "not-authenticated",
      message: authMessage(auth),
    }, { status: 409 });
  }
  const result = await cursorComposerProvider.refreshModels(providerConfig, config, { force: true });
  if (!result.refreshed) {
    return json({
      connected: true,
      ...result,
      message: "Cursor model discovery did not return a usable model list. The previous cache was kept.",
    }, { status: 502 });
  }
  return json({
    connected: true,
    ...result,
    message: `${result.count} Cursor models are now available in Shimex.`,
  });
}

async function handleStatus(cursorProviderConfig) {
  const auth = await checkCursorAgentAuth(cursorProviderConfig());
  return json({
    connected: Boolean(auth.authenticated),
    bypassed: Boolean(auth.bypassed),
    agentBin: displayAgentBin(auth.agentBin),
    reason: auth.reason || "",
    message: authMessage(auth),
  });
}

async function startLogin(cursorProviderConfig) {
  const active = [...cursorLoginJobs.values()].find((job) => job.status === "pending");
  if (active) {
    return json({
      login: publicLogin(active),
      message: "Cursor browser login is already in progress.",
    }, { status: 202 });
  }

  const providerConfig = cursorProviderConfig();
  const agentBin = await resolveCursorAgentBin(providerConfig);
  const job = {
    id: `cursor_login_${randomUUID().replaceAll("-", "")}`,
    status: "pending",
    agentBin,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    exitCode: null,
    reason: "",
    child: null,
    timeout: null,
  };

  try {
    job.child = spawn(agentBin, ["login"], {
      cwd: cursorWorkspace(providerConfig),
      env: cursorAgentEnv(),
      // Cursor owns the browser flow. Never send its stdout/stderr through the
      // HTTP response, because CLI output may contain authentication material.
      stdio: "ignore",
    });
  } catch (error) {
    job.status = "error";
    job.finishedAt = new Date().toISOString();
    job.reason = classifyLoginError(error);
    cursorLoginJobs.set(job.id, job);
    retainLoginJob(job);
    return json({ login: publicLogin(job), message: loginMessage(job) }, { status: 500 });
  }

  cursorLoginJobs.set(job.id, job);
  job.child.once("error", (error) => finishLogin(job, "error", classifyLoginError(error), null));
  job.child.once("close", (code) => {
    if (job.finishedAt) return;
    finishLogin(job, code === 0 ? "complete" : "error", code === 0 ? "" : "login-exit", code);
  });
  job.timeout = setTimeout(() => {
    if (job.finishedAt) return;
    try {
      job.child.kill();
    } catch {
      // The child may already have exited between the guard and kill().
    }
    finishLogin(job, "timeout", "login-timeout", null);
  }, LOGIN_TIMEOUT_MS);
  job.timeout.unref?.();

  return json({
    login: publicLogin(job),
    message: "Cursor browser login started on this host.",
  }, { status: 202 });
}

async function handleLoginStatus(loginId, cursorProviderConfig) {
  if (!loginId) return json({ error: "Cursor login id is required." }, { status: 400 });
  const job = cursorLoginJobs.get(loginId);
  if (!job) return json({ error: "Cursor login not found or expired." }, { status: 404 });

  const auth = await checkCursorAgentAuth(cursorProviderConfig());
  return json({
    login: publicLogin(job),
    connected: Boolean(auth.authenticated),
    bypassed: Boolean(auth.bypassed),
    message: auth.authenticated ? "Cursor is connected." : loginMessage(job, auth),
  });
}

function finishLogin(job, status, reason, exitCode) {
  if (job.finishedAt) return;
  if (job.timeout) clearTimeout(job.timeout);
  job.status = status;
  job.reason = reason || "";
  job.exitCode = exitCode;
  job.finishedAt = new Date().toISOString();
  job.child = null;
  clearCursorAgentAuthCache();
  retainLoginJob(job);
}

function retainLoginJob(job) {
  const timer = setTimeout(() => cursorLoginJobs.delete(job.id), LOGIN_RETENTION_MS);
  timer.unref?.();
}

function publicLogin(job) {
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    reason: job.reason,
    agentBin: displayAgentBin(job.agentBin),
  };
}

function classifyLoginError(error) {
  if (error?.code === "ENOENT") return "not-installed";
  if (error?.code === "EACCES") return "not-executable";
  return "login-process-error";
}

function authMessage(auth = {}) {
  if (auth.authenticated) {
    return auth.bypassed ? "Cursor model visibility is enabled without auth by configuration." : "Cursor is connected.";
  }
  if (auth.reason === "not-installed") {
    return "Cursor Agent CLI was not found on this host. Install it, then refresh.";
  }
  if (auth.reason === "status-timeout") {
    return "Cursor Agent status timed out. Check the local CLI, then refresh.";
  }
  return "Cursor is not connected. Sign in to your Cursor account to use the subscription model.";
}

function loginMessage(job, auth = {}) {
  if (auth.authenticated) return authMessage(auth);
  if (job.reason === "not-installed") return "Cursor Agent CLI was not found. Install it, then try again.";
  if (job.reason === "not-executable") return "Cursor Agent CLI is not executable on this host.";
  if (job.reason === "login-timeout") return "Cursor browser login timed out. Try again.";
  if (job.reason === "login-exit") return `Cursor browser login exited with code ${job.exitCode ?? "unknown"}.`;
  if (job.reason === "login-process-error") return "Cursor browser login could not start.";
  if (job.status === "pending") return "Cursor browser login is waiting for you to finish in the browser.";
  return "Cursor is not connected yet. Finish the browser login, then refresh.";
}

function displayAgentBin(value) {
  if (!value) return "";
  return String(value).replace(homedir(), "~");
}

function methodNotAllowed(methods) {
  return json({ error: `method not allowed; use ${methods.join(", ")}` }, {
    status: 405,
    headers: { allow: methods.join(", ") },
  });
}

function json(value, init = {}) {
  return {
    status: init.status || 200,
    body: JSON.stringify(value, null, 2),
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  };
}
