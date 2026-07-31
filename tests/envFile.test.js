import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readProjectEnvFile,
  validateProjectEnvText,
  writeProjectEnvFile,
} from "../src/core/env.js";

describe("project .env file helpers", () => {
  test("validates and rewrites .env with backup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shimex-envfile-"));
    const path = join(dir, ".env");
    await writeFile(path, "FOO=one\nBAR=two\n");

    const validation = validateProjectEnvText("FOO=one\nBAR=two\n");
    assert.equal(validation.keyCount, 2);

    const saved = await writeProjectEnvFile("FOO=updated\nBAZ=three\n", { path });
    assert.equal(saved.ok, true);
    assert.equal(saved.keyCount, 2);
    assert.match(await readFile(path, "utf8"), /FOO=updated/);
    assert.match(await readFile(`${path}.bak`, "utf8"), /BAR=two/);

    const loaded = await readProjectEnvFile({ path });
    assert.deepEqual(loaded.keys, ["FOO", "BAZ"]);
  });

  test("rejects invalid and duplicate keys", () => {
    assert.throws(() => validateProjectEnvText("NOT A KEY"), /Invalid \.env line/);
    assert.throws(() => validateProjectEnvText("FOO=1\nFOO=2\n"), /Duplicate env key/);
  });
});
