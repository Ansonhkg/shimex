import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("public Kimi K3 content", () => {
  test("announces Kimi K3 in visible and search metadata", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    assert.match(html, /<title>Shimex — Use Kimi K3 and Any LLM in Codex Desktop<\/title>/);
    assert.match(html, /Kimi K3 is now supported in Codex Desktop through ClinePass/);
    assert.match(html, /<section id="kimi-k3">/);
    assert.match(html, /shimex-update-kimi-k3-dismissed/);
    assert.doesNotMatch(html, /shimex-update-gpt-5-6-dismissed/);
  });

  test("publishes valid Kimi K3 structured data", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const graph = JSON.parse(source)["@graph"];
    const software = graph.find((entry) => entry["@type"] === "SoftwareApplication");
    const faq = graph.find((entry) => entry["@type"] === "FAQPage");
    assert.ok(software.featureList.some((feature) => feature.includes("Kimi K3")));
    assert.ok(faq.mainEntity.some((entry) => entry.name === "Can I use Kimi K3 in Codex Desktop?"));
  });

  test("keeps README and crawler resources aligned", async () => {
    const [readme, llms, sitemap] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../web/llms.txt", import.meta.url), "utf8"),
      readFile(new URL("../web/sitemap.xml", import.meta.url), "utf8"),
    ]);
    assert.match(readme, /^> \*\*Latest update:\*\* Kimi K3/m);
    assert.match(readme, /## Kimi K3 in Codex Desktop/);
    assert.match(llms, /Kimi K3 through ClinePass/);
    assert.match(sitemap, /<lastmod>2026-07-19<\/lastmod>/);
  });
});
