import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { patchExtractedBundles } from "../src/clients/codex/patch.js";

describe("Codex app bundle patching", () => {
  test("patches previous minified model picker and sidebar provider filters", async () => {
    await assertPatchRoundTrip(
      "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:Ae,useStateDbOnly:n};return this.params.requestClient.sendRequest(`thread/list`,r)}}",
    );
  });

  test("patches Codex build 5018 sidebar provider filter", async () => {
    await assertPatchRoundTrip(
      "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1,background:r=!1}){let i={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:p_,useStateDbOnly:n},a=await this.params.requestClient.sendRequest(`thread/list`,i,r?{priority:`background`,source:`recent_threads`}:{source:`recent_threads`});return{...a,data:a.data.filter(e=>e.ephemeral!==!0)}}}",
    );
  });
});

async function assertPatchRoundTrip(sidebarText) {
  const root = await mkdtemp(join(tmpdir(), "shimex-codex-patch-"));
  const assets = join(root, "webview", "assets");
  await mkdir(assets, { recursive: true });
  const picker = join(assets, "picker.js");
  const sidebar = join(assets, "sidebar.js");
  await writeFile(picker, "function Zpe({authMethod:e,availableModels:t,defaultModel:n,enabledReasoningEfforts:r,includeUltraReasoningEffort:i,models:a,useHiddenModels:o}){let s=[],c=null,l=o&&e!==`amazonBedrock`,u=a.some(e=>e.hidden);return{models:s,defaultModel:c}}");
  await writeFile(sidebar, sidebarText);

  const first = await patchExtractedBundles(root);
  assert.deepEqual(first, { changed: true });
  assert.match(await readFile(picker, "utf8"), /l=!1,u=/);
  assert.match(await readFile(sidebar, "utf8"), /modelProviders:\[\]/);

  const second = await patchExtractedBundles(root);
  assert.deepEqual(second, { changed: false });
}
