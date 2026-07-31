import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("public Shimex content", () => {
  test("announces the Grok 4.5 bridge in visible and search metadata", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    assert.match(html, /<title>Shimex — Remote Grok 4\.5 for Codex Desktop<\/title>/);
    assert.match(html, /Grok 4\.5 is now available from remote Tailscale clients/);
    assert.match(html, /shimex-update-grok-4-5-dismissed/);
    assert.match(html, /Kimi K3 is now supported in Shimex through ClinePass/);
    assert.match(html, /<section id="kimi-k3">/);
    assert.match(html, /<section id="host-client">/);
    assert.match(html, /blog\/host-client-bridge\.html/);
  });

  test("publishes valid provider and bridge structured data", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const graph = JSON.parse(source)["@graph"];
    const software = graph.find((entry) => entry["@type"] === "SoftwareApplication");
    const faq = graph.find((entry) => entry["@type"] === "FAQPage");
    const navigation = graph.find((entry) => entry["@type"] === "ItemList");
    assert.ok(software.featureList.some((feature) => feature.includes("Grok 4.5")));
    assert.ok(software.featureList.some((feature) => feature.includes("Kimi K3")));
    assert.ok(faq.mainEntity.some((entry) => entry.name === "Can I use Kimi K3 in Codex Desktop?"));
    assert.ok(faq.mainEntity.some((entry) => entry.name.includes("remote machine") && entry.name.includes("Grok 4.5")));
    assert.ok(navigation.itemListElement.some((entry) => entry.name === "Host/client bridge"));
  });

  test("publishes the host/client bridge article with crawlable SEO data", async () => {
    const html = await readFile(new URL("../web/blog/host-client-bridge.html", import.meta.url), "utf8");
    assert.match(html, /<link rel="canonical" href="https:\/\/shimex\.xyz\/blog\/host-client-bridge\.html">/);
    assert.match(html, /Use Grok 4\.5 from a remote Codex Desktop client/);
    assert.match(html, /assets\/shimex-bridge\.svg/);
    const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const graph = JSON.parse(source)["@graph"];
    assert.ok(graph.some((entry) => entry["@type"] === "BlogPosting"));
    assert.ok(graph.some((entry) => entry["@type"] === "HowTo"));
    assert.ok(graph.some((entry) => entry["@type"] === "FAQPage"));
  });

  test("publishes a crawlable guides hub", async () => {
    const html = await readFile(new URL("../web/blog/index.html", import.meta.url), "utf8");
    assert.match(html, /<link rel="canonical" href="https:\/\/shimex\.xyz\/blog\/">/);
    assert.match(html, /host-client-bridge\.html/);
    const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const page = JSON.parse(source);
    assert.equal(page["@type"], "CollectionPage");
  });

  test("keeps README and crawler resources aligned", async () => {
    const [readme, llms, sitemap] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../web/llms.txt", import.meta.url), "utf8"),
      readFile(new URL("../web/sitemap.xml", import.meta.url), "utf8"),
    ]);
    assert.match(readme, /^> \*\*Latest update:\*\* Kimi K3/m);
    assert.match(readme, /## Kimi K3 in Codex Desktop/);
    assert.match(llms, /Grok 4\.5/);
    assert.match(llms, /Host\/client bridge guide/);
    assert.match(sitemap, /<loc>https:\/\/shimex\.xyz\/blog\/host-client-bridge\.html<\/loc>/);
    assert.match(sitemap, /<lastmod>2026-07-30<\/lastmod>/);
  });
});
