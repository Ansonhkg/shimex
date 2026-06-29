import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export function projectRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function expandHome(value) {
  const text = String(value || "");
  if (text === "~") {
    return homedir();
  }
  if (text.startsWith("~/")) {
    return resolve(homedir(), text.slice(2));
  }
  return text;
}

export function expandEnv(value) {
  return expandHome(String(value || "").replace(/\$\{([^}]+)\}/g, (_match, name) => process.env[name] || ""));
}

