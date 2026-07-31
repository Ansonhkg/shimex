import { readGrokAuth, resolveGrokAuth } from "../providers/grok/auth.js";

const DEFAULT_GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

export function createGrokAuthRoutes(config) {
  const grokProviderConfig = () =>
    (config.providers && config.providers.find((provider) => provider.id === "grok")) || {
      id: "grok",
      options: {},
    };

  return {
    async route(request, url, options = {}) {
      const path = url.pathname;
      const method = request.method || "GET";
      if (path === "/api/grok-auth") {
        if (method !== "GET") return methodNotAllowed(["GET"]);
        return await handleStatus(grokProviderConfig, options);
      }
      if (path === "/api/grok-auth/usage") {
        if (method !== "GET") return methodNotAllowed(["GET"]);
        return await handleUsage(grokProviderConfig, options);
      }
      return null;
    },
  };
}

async function handleStatus(grokProviderConfig, options = {}) {
  const auth = await readGrokAuth({
    authPath: grokProviderConfig().options?.auth_path || grokProviderConfig().options?.authPath || grokProviderConfig().auth?.path,
  });
  if (!auth) {
    return json({
      connected: false,
      path: "~/.grok/auth.json",
      session: null,
      message: "Grok session auth is not available. Run `grok login` on this host.",
    });
  }
  return json({
    connected: true,
    path: auth.path,
    session: publicSession(auth),
  });
}

async function handleUsage(grokProviderConfig, options = {}) {
  const auth = await resolveGrokAuth({
    authPath: grokProviderConfig().options?.auth_path || grokProviderConfig().options?.authPath || grokProviderConfig().auth?.path,
    fetch: options.fetch,
  });
  if (!auth?.accessToken) {
    return json({
      error: "Grok session auth is not available. Run `grok login` on this host.",
      connected: false,
    }, { status: 401 });
  }

  const billingUrl = billingCreditsUrl(grokProviderConfig());
  let response;
  try {
    response = await (options.fetch || fetch)(billingUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${auth.accessToken}`,
        "user-agent": "xai-grok-build/0.2.117",
        "x-grok-client-version": "0.2.117",
        "x-grok-client-surface": "grok-build",
        "x-grok-client-mode": "cli",
      },
      signal: options.signal,
    });
  } catch (error) {
    return json({ error: `upstream billing probe failed: ${String(error?.message || error)}` }, { status: 502 });
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: `billing response was not JSON (HTTP ${response.status})`, raw: text.slice(0, 200) }, { status: 502 });
  }
  if (!response.ok) {
    return json({
      error: payload?.error || payload?.message || `HTTP ${response.status}`,
      status: response.status,
    }, { status: 502 });
  }

  return json({
    connected: true,
    session: publicSession(auth),
    usage: normalizeGrokUsage(payload),
    fetchedAt: new Date().toISOString(),
  });
}

function normalizeGrokUsage(payload) {
  const config = payload?.config && typeof payload.config === "object" ? payload.config : payload || {};
  const usedPercent = numberOrNull(config.creditUsagePercent);
  const remainingPercent = usedPercent == null ? null : Math.max(0, Math.min(100, 100 - usedPercent));
  const period = config.currentPeriod && typeof config.currentPeriod === "object" ? config.currentPeriod : {};
  const products = Array.isArray(config.productUsage)
    ? config.productUsage.map((item) => {
      const used = numberOrNull(item?.usagePercent);
      return {
        product: String(item?.product || "Product"),
        usedPercent: used,
        remainingPercent: used == null ? null : Math.max(0, Math.min(100, 100 - used)),
      };
    })
    : [];

  return {
    usedPercent,
    remainingPercent,
    periodType: String(period.type || "").replace(/^USAGE_PERIOD_TYPE_/, "").toLowerCase() || "",
    periodStart: String(period.start || config.billingPeriodStart || ""),
    periodEnd: String(period.end || config.billingPeriodEnd || ""),
    billingPeriodStart: String(config.billingPeriodStart || period.start || ""),
    billingPeriodEnd: String(config.billingPeriodEnd || period.end || ""),
    prepaidBalance: moneyVal(config.prepaidBalance),
    onDemandCap: moneyVal(config.onDemandCap),
    onDemandUsed: moneyVal(config.onDemandUsed),
    isUnifiedBillingUser: config.isUnifiedBillingUser === true,
    topUpMethod: String(config.topUpMethod || ""),
    products,
  };
}

function publicSession(auth) {
  return {
    path: auth.path,
    email: auth.email || "",
    userId: auth.userId || "",
    teamId: auth.teamId || "",
    expiresAt: auth.expiresAt || "",
    issuer: auth.issuer || "",
  };
}

function billingCreditsUrl(providerConfig = {}) {
  return String(
    providerConfig.options?.billing_url
      || providerConfig.options?.billingUrl
      || process.env.GROK_BILLING_URL
      || DEFAULT_GROK_BILLING_URL,
  );
}

function moneyVal(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value && Number.isFinite(Number(value.val))) return Number(value.val);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
