import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { patchExtractedBundles, patchIabPeerAuthorizationBypass } from "../src/clients/codex/patch.js";

describe("Codex app bundle patching", () => {
  test("shows hidden custom models and patches previous sidebar provider filters", async () => {
    await assertPatchRoundTrip(
      "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:Ae,useStateDbOnly:n};return this.params.requestClient.sendRequest(`thread/list`,r)}}",
    );
  });

  test("patches Codex build 5018 sidebar provider filter", async () => {
    await assertPatchRoundTrip(
      "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1,background:r=!1}){let i={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:p_,useStateDbOnly:n},a=await this.params.requestClient.sendRequest(`thread/list`,i,r?{priority:`background`,source:`recent_threads`}:{source:`recent_threads`});return{...a,data:a.data.filter(e=>e.ephemeral!==!0)}}}",
    );
  });

  test("patches Codex build 5551 sidebar provider filter", async () => {
    await assertPatchRoundTrip(
      "class X{async listRecentThreads({cursor:e,limit:t,background:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:ie,useStateDbOnly:!0},i=await this.params.requestClient.sendRequest(`thread/list`,r,n?{priority:`background`,source:`recent_threads`}:{source:`recent_threads`});return{...i,data:i.data.filter(e=>e.ephemeral!==!0)}}}",
    );
  });

  test("bypasses iab peer auth without switching to Dev flavor", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-codex-iab-"));
    const build = join(root, ".vite", "build");
    await mkdir(build, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "openai-codex-electron",
      codexBuildFlavor: "dev",
      codexShimexIabPeerAuthBypass: true,
      version: "26.721.81911",
    }, null, 2));
    await writeFile(join(build, "main.js"), [
      "function shouldIncludeBrowserUsePeerAuthorization(e,t){return t===`darwin`&&d.includes(e)}",
      "function shouldIncludeBrowserUsePeerAuthorization(e,t){return t===`darwin`&&P5.includes(e)}",
    ].join("\n"));

    const first = await patchIabPeerAuthorizationBypass(root);
    assert.equal(first.changed, true);
    assert.equal(first.matches, 1);
    assert.equal(first.packageChanged, true);
    const payload = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.equal(payload.codexBuildFlavor, "prod");
    assert.equal(payload.codexShimexIabPeerAuthBypass, undefined);
    const main = await readFile(join(build, "main.js"), "utf8");
    assert.match(main, /shouldIncludeBrowserUsePeerAuthorization\(e,t\)\{return!1\}/g);
    assert.equal([...main.matchAll(/return!1/g)].length, 2);

    const second = await patchIabPeerAuthorizationBypass(root);
    assert.equal(second.changed, false);
    assert.equal(second.reason, "already-bypassed");
  });

  test("patches the Codex 26.721 picker visibility condition", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-codex-patch-"));
    const assets = join(root, "webview", "assets");
    await mkdir(assets, { recursive: true });
    const picker = join(assets, "picker.js");
    const sidebar = join(assets, "sidebar.js");
    await writeFile(picker, "function MJr({additionalAvailableModels:e,authMethod:t,availableModels:n,defaultModel:r,enabledReasoningEfforts:i,includeUltraReasoningEffort:a,models:o,useHiddenModels:s}){let c=[],l=null,u=s&&t!==`amazonBedrock`,d=o.some(e=>e.hidden),f=a&&o.some(e=>e.hidden);return o.forEach(r=>{if(e?.has(r.model)===!0||(u?n.has(r.model):!r.hidden)){c.push(r)}}),{models:c,defaultModel:l}}");
    await writeFile(sidebar, "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:Ae,useStateDbOnly:n};return this.params.requestClient.sendRequest(`thread/list`,r)}}");

    assert.deepEqual(await patchExtractedBundles(root), { changed: true });
    assert.match(await readFile(picker, "utf8"), /forEach\(r=>\{if\(!0\)\{/);
  });

  test("patches the Codex 26.727 picker helper predicate", async () => {
    const root = await mkdtemp(join(tmpdir(), "shimex-codex-patch-"));
    const assets = join(root, "webview", "assets");
    await mkdir(assets, { recursive: true });
    const picker = join(assets, "picker.js");
    const sidebar = join(assets, "sidebar.js");
    await writeFile(picker, "function G$r({additionalAvailableModels:e,authMethod:t,availableModels:n,defaultModel:r,enabledReasoningEfforts:i,includeUltraReasoningEffort:a,models:o,useHiddenModels:s}){let c=[],l=null,u=o.some(e=>e.supportedReasoningEfforts.some(({reasoningEffort:e})=>e===`max`)),d=a&&o.some(e=>e.supportedReasoningEfforts.some(({reasoningEffort:e})=>e===`ultra`));return o.forEach(r=>{if(K$r({additionalAvailableModels:e,authMethod:t,availableModels:n,model:r,useHiddenModels:s})){c.push(r)}),{models:c,defaultModel:l}}function K$r({additionalAvailableModels:e,authMethod:t,availableModels:n,model:r,useHiddenModels:i}){return e?.has(r.model)===!0||(i&&t!==`amazonBedrock`?n.has(r.model):!r.hidden)}");
    await writeFile(sidebar, "class X{async listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:Ae,useStateDbOnly:n};return this.params.requestClient.sendRequest(`thread/list`,r)}}");

    assert.deepEqual(await patchExtractedBundles(root), { changed: true });
    assert.match(await readFile(picker, "utf8"), /forEach\(r=>\{if\(!0\)\{/);
  });
});

async function assertPatchRoundTrip(sidebarText) {
  const root = await mkdtemp(join(tmpdir(), "shimex-codex-patch-"));
  const assets = join(root, "webview", "assets");
  await mkdir(assets, { recursive: true });
  const picker = join(assets, "picker.js");
  const sidebar = join(assets, "sidebar.js");
  await writeFile(picker, "function Zpe({authMethod:e,availableModels:t,defaultModel:n,enabledReasoningEfforts:r,includeUltraReasoningEffort:i,models:a,useHiddenModels:o}){let s=[],c=null,l=o&&e!==`amazonBedrock`,u=a.some(e=>e.hidden);return a.forEach(n=>{if(l?t.has(n.model):!n.hidden){s.push(n)}}),{models:s,defaultModel:c}}");
  await writeFile(sidebar, sidebarText);

  const first = await patchExtractedBundles(root);
  assert.deepEqual(first, { changed: true });
  assert.match(await readFile(picker, "utf8"), /forEach\(n=>\{if\(!0\)\{/);
  assert.match(await readFile(sidebar, "utf8"), /modelProviders:\[\]/);

  const second = await patchExtractedBundles(root);
  assert.deepEqual(second, { changed: false });
}
