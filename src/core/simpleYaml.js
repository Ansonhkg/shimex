export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text
    .split(/\r?\n/)
    .map((raw) => stripComment(raw))
    .filter((line) => line.trim());
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      continue;
    }
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }
    const parent = stack.at(-1).value;
    if (trimmed.startsWith("- ")) {
      const item = parseListItem(trimmed.slice(2));
      if (!Array.isArray(parent)) {
        throw new Error(`list item without list parent: ${trimmed}`);
      }
      parent.push(item.value);
      if (item.container) {
        stack.push({ indent, value: item.value });
      }
      continue;
    }
    const next = nextSignificantLine(lines, lineIndex);
    const { key, value, container } = parseKeyValue(trimmed, indent, next);
    if (container === "list") {
      parent[key] = [];
      stack.push({ indent, value: parent[key] });
    } else if (container === "object") {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = value;
    }
  }
  return root;
}

function parseListItem(text) {
  if (!text.includes(":")) {
    return { value: parseScalar(text), container: false };
  }
  const { key, value, container } = parseKeyValue(text);
  const object = {};
  if (container === "object") {
    object[key] = {};
  } else if (container === "list") {
    object[key] = [];
  } else {
    object[key] = value;
  }
  return { value: object, container: true };
}

function parseKeyValue(text, indent = 0, next = null) {
  const index = text.indexOf(":");
  if (index < 0) {
    throw new Error(`expected key/value line: ${text}`);
  }
  const key = text.slice(0, index).trim();
  const raw = text.slice(index + 1).trim();
  if (!raw) {
    if (next && next.indent > indent && next.trimmed.startsWith("- ")) {
      return { key, value: null, container: "list" };
    }
    return { key, value: null, container: "object" };
  }
  if (raw === "[]") {
    return { key, value: [], container: false };
  }
  return { key, value: parseScalar(raw), container: false };
}

function nextSignificantLine(lines, lineIndex) {
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }
    return {
      indent: line.match(/^ */)[0].length,
      trimmed: line.trim(),
    };
  }
  return null;
}

function parseScalar(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item.trim()));
  }
  return raw.replace(/^["']|["']$/g, "");
}

function stripComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? "" : char;
    }
    if (!quote && char === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}
