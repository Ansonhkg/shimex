import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0", "shimex.localhost"]);

export async function resolveAdvertiseUrl(config, options = {}) {
  const port = Number(options.port || config?.runtime?.port || 5413);
  const explicit = firstNonEmpty(
    options.url,
    process.env.SHIMEX_ADVERTISE_URL,
    config?.runtime?.advertiseUrl,
  );
  if (explicit) {
    return {
      url: normalizeOrigin(explicit, port),
      source: "explicit",
      candidates: [],
    };
  }

  const publicUrl = String(config?.runtime?.publicUrl || "").trim();
  if (publicUrl && !isLoopbackUrl(publicUrl)) {
    return {
      url: normalizeOrigin(publicUrl, port),
      source: "public_url",
      candidates: [],
    };
  }

  const candidates = [];

  const tailscale = await detectTailscaleEndpoint(port).catch(() => null);
  if (tailscale) {
    candidates.push(tailscale);
  }

  for (const lan of detectLanEndpoints(port)) {
    candidates.push(lan);
  }

  if (candidates.length) {
    // Prefer Tailscale DNS/IP, then private LAN IPs.
    const preferred = candidates.find((item) => item.source.startsWith("tailscale")) || candidates[0];
    return {
      url: preferred.url,
      source: preferred.source,
      candidates,
    };
  }

  const fallback = normalizeOrigin(publicUrl || `http://127.0.0.1:${port}`, port);
  return {
    url: fallback,
    source: "loopback-fallback",
    candidates,
    warning: "No Tailscale/LAN address found. Start Tailscale or pass --url http://<host>:5413",
  };
}

export async function detectTailscaleEndpoint(port = 5413) {
  // Prefer MagicDNS name, then Tailscale IPv4.
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
      timeout: 1500,
      maxBuffer: 2_000_000,
    });
    const data = JSON.parse(stdout || "{}");
    const self = data?.Self || {};
    const dnsName = String(self.DNSName || "").replace(/\.$/, "");
    const ips = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
    const ip4 = ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(String(ip)));
    if (dnsName) {
      return {
        source: "tailscale-dns",
        host: dnsName,
        url: `http://${dnsName}:${port}`,
      };
    }
    if (ip4) {
      return {
        source: "tailscale-ip",
        host: ip4,
        url: `http://${ip4}:${port}`,
      };
    }
  } catch {
    // fall through to simpler commands
  }

  try {
    const { stdout } = await execFileAsync("tailscale", ["ip", "-4"], { timeout: 1500 });
    const ip4 = String(stdout || "").trim().split(/\s+/)[0];
    if (ip4 && /^\d+\.\d+\.\d+\.\d+$/.test(ip4)) {
      return {
        source: "tailscale-ip",
        host: ip4,
        url: `http://${ip4}:${port}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function detectLanEndpoints(port = 5413) {
  const interfaces = networkInterfaces();
  const out = [];
  for (const [name, entries] of Object.entries(interfaces || {})) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") {
        continue;
      }
      const address = String(entry.address || "");
      if (!address || address.startsWith("127.")) {
        continue;
      }
      // Prefer common private ranges; still include others as fallback.
      const privateRange = isPrivateIpv4(address);
      out.push({
        source: privateRange ? `lan:${name}` : `iface:${name}`,
        host: address,
        url: `http://${address}:${port}`,
        private: privateRange,
      });
    }
  }
  out.sort((a, b) => Number(b.private) - Number(a.private));
  return out;
}

export function isLoopbackUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

function normalizeOrigin(value, port) {
  const raw = String(value || "").trim();
  if (!raw) {
    return `http://127.0.0.1:${port}`;
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    if (!url.port) {
      url.port = String(port);
    }
    return url.origin;
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function isPrivateIpv4(address) {
  const parts = String(address).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Tailscale CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
