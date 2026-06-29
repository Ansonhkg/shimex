import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectEnv } from "../src/core/env.js";

describe("Project env loading", () => {
  test("loads .env values without overriding existing process env", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-env-"));
    const envPath = join(root, ".env");
    const previousLoaded = process.env.SHIMEX_ENV_TEST_LOADED;
    const previousPreserved = process.env.SHIMEX_ENV_TEST_PRESERVED;
    process.env.SHIMEX_ENV_TEST_PRESERVED = "from-shell";
    delete process.env.SHIMEX_ENV_TEST_LOADED;
    try {
      await writeFile(envPath, [
        "# local secrets",
        "SHIMEX_ENV_TEST_LOADED=from-env",
        "SHIMEX_ENV_TEST_PRESERVED=from-env",
        "QUOTED_VALUE=\"hello world\"",
        "COMMENT_VALUE=value # comment",
      ].join("\n"));

      const result = await loadProjectEnv(envPath);
      assert.equal(result.loaded, true);
      assert.equal(process.env.SHIMEX_ENV_TEST_LOADED, "from-env");
      assert.equal(process.env.SHIMEX_ENV_TEST_PRESERVED, "from-shell");
      assert.equal(process.env.QUOTED_VALUE, "hello world");
      assert.equal(process.env.COMMENT_VALUE, "value");
    } finally {
      restoreEnv("SHIMEX_ENV_TEST_LOADED", previousLoaded);
      restoreEnv("SHIMEX_ENV_TEST_PRESERVED", previousPreserved);
      delete process.env.QUOTED_VALUE;
      delete process.env.COMMENT_VALUE;
    }
  });
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
