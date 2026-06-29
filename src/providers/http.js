export function joinEndpoint(baseUrl, suffix) {
  const base = String(baseUrl || "").trim();
  if (!base) {
    throw new Error("Provider endpoint is not configured.");
  }
  return `${base.replace(/\/+$/, "")}/${String(suffix || "").replace(/^\/+/, "")}`;
}

export function openAiHeaders(route, accept = "application/json") {
  const headers = {
    accept,
    "content-type": "application/json",
    "user-agent": "shimex",
  };
  const token = authToken(route.providerConfig.auth);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (requiresAuth(route.providerConfig.auth)) {
    return null;
  }
  return headers;
}

export function anthropicHeaders(route, accept = "application/json") {
  const headers = {
    accept,
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "user-agent": "shimex",
  };
  const token = authToken(route.providerConfig.auth);
  if (token) {
    headers["x-api-key"] = token;
  } else if (requiresAuth(route.providerConfig.auth)) {
    return null;
  }
  return headers;
}

export async function upstreamError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText, type: "upstream_error" } };
  }
}

export function authMissingResult(providerId) {
  return {
    error: {
      message: `${providerId} auth is not available. Check the provider auth env var in shimex.yml.`,
      type: "shimex_auth_unavailable",
    },
  };
}

export async function* readSseJson(response) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        yield JSON.parse(data);
      }
    }
  }
}

function authToken(auth) {
  if (!auth || auth.type === "none") {
    return "";
  }
  const names = [
    auth.name,
    ...(Array.isArray(auth.names) ? auth.names : []),
  ].filter(Boolean);
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return "";
}

function requiresAuth(auth) {
  if (!auth || auth.type === "none") {
    return false;
  }
  return ["env", "env-or-header"].includes(auth.type);
}

