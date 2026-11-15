// The whole check on recorded responses and saved model reads, and with
// injected failures: each part must fail on its own (spec 6.3 empty states).
// Never calls the model: the cache is read-only and there is no model client.

import { describe, expect, it } from "vitest";
import { runCheck } from "./check";
import type { ModelDeps } from "./extract";
import { ModelCache } from "./modelCache";
import { FaultyTransport, type Faults } from "./ucp/faulty";
import { RECORDED_LINKS, RecordedTransport } from "./ucp/recorded";

const [BURROW, GARVEE] = RECORDED_LINKS as [string, string];
const saved: ModelDeps = { model: null, cache: new ModelCache("readonly") };
const faulty = (faults: Faults) => new FaultyTransport(new RecordedTransport(), faults);

describe("runCheck on recorded responses", () => {
  it("builds Burrow's card", async () => {
    const card = await runCheck(new RecordedTransport(), BURROW, "14228", saved);

    expect(card.product).toMatchObject({ title: "Nomad Sofa", seller: { name: "Burrow" }, rating: { value: 3.8, count: 18 }, variantNote: null });
    expect(card.product.checkoutUrl).toContain("burrow-prod.myshopify.com/buy/50484946305326:1");
    expect(card.toBuy).toEqual({ status: "priced", listedCents: 136400, deliveryCents: 6900, deliveryLabel: "Standard Shipping", doorCents: 143300 });
    expect(card.tryFirst).toMatchObject({ status: "sample", checkoutUrl: "https://burrow-prod.myshopify.com/cart/50269421830446:1" });
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { policy: { status: "read" }, assistant: { status: "answered" } } });
    expect(card.steps.map((s) => [s.id, s.outcome])).toEqual([
      ["identify", "ok"],
      ["price", "ok"],
      ["sample", "ok"],
      ["policy", "ok"],
      ["assistant", "ok"],
      ["extract", "ok"],
    ]);
    expect(card.steps.find((s) => s.id === "extract")!.endpoint).toBe("a saved read of the same texts");
  });

  it("builds Garvee's card with no sample and unstated fees", async () => {
    const card = await runCheck(new RecordedTransport(), GARVEE, "14228", saved);
    expect(card.toBuy).toMatchObject({ status: "priced", deliveryCents: 0, doorCents: 68199 });
    expect(card.tryFirst).toEqual({ status: "none", otherSamples: false });
    expect(card.steps.find((s) => s.id === "sample")).toMatchObject({ outcome: "empty", summary: expect.stringContaining('"Corduroy swatch" (10 results)') });
  });

  it("refuses links and ZIPs that were never recorded", async () => {
    await expect(runCheck(new RecordedTransport(), "https://example.com/products/x", "14228", saved)).rejects.toMatchObject({ code: "not_recorded" });
    await expect(runCheck(new RecordedTransport(), BURROW, "10001", saved)).rejects.toMatchObject({ code: "not_recorded" });
  });

  it("says why when there is no saved read and no key", async () => {
    const card = await runCheck(new RecordedTransport(), BURROW, "14228", { model: null, cache: new ModelCache("off") });
    expect(card.ifWrong).toMatchObject({ status: "unreadable", reason: expect.stringContaining("no ANTHROPIC_API_KEY") });
    expect(card.tryFirst).toMatchObject({ status: "unavailable" });
  });
});

describe("runCheck when parts fail", () => {
  it("keeps the card when the cart and the sample search fail", async () => {
    const card = await runCheck(faulty({ tools: ["create_cart", "search_catalog"] }), BURROW, "14228", saved);
    expect(card.toBuy).toMatchObject({ status: "unavailable", reason: expect.stringContaining("create_cart timed out") });
    expect(card.tryFirst).toMatchObject({ status: "unavailable" });
    expect(card.ifWrong.status).toBe("terms");
    // Without a delivery figure the line still says the refund isn't stated.
    expect(card.ifWrong.status === "terms" && card.ifWrong.lines.find((l) => l.kind === "delivery_refund_unstated")).toMatchObject({ deliveryCents: null });
    expect(card.steps.filter((s) => s.outcome === "failed").map((s) => s.id)).toEqual(["price", "sample"]);
  });

  it("uses the assistant alone, labelled, when the policy page can't be read", async () => {
    const card = await runCheck(faulty({ pages: true }), BURROW, "14228", saved);
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { policy: { status: "failed", reason: expect.stringContaining("503") } } });
    if (card.ifWrong.status === "terms") {
      expect(card.ifWrong.lines.flatMap((l) => l.quotes).every((q) => q.source === "assistant")).toBe(true);
    }
    expect(card.steps.find((s) => s.id === "policy")!.outcome).toBe("failed");
  });

  it("uses the policy alone when the store offers no ask_business", async () => {
    const card = await runCheck(faulty({ noAsk: true }), BURROW, "14228", saved);
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { assistant: { status: "not_offered" } } });
    if (card.ifWrong.status === "terms") {
      expect(card.ifWrong.lines.flatMap((l) => l.quotes).every((q) => q.source === "policy")).toBe(true);
    }
    expect(card.steps.find((s) => s.id === "assistant")!.outcome).toBe("empty");
  });
});

describe("findProduct fallback", () => {
  const plain = "https://burrow.com/products/nomad-plus-sofa";

  it("searches the Catalog for the page's title when the link doesn't resolve, and says the variant was guessed", async () => {
    const searches: string[] = [];
    const t = faulty({
      page: (url) => (url === plain ? { url, html: '<meta property="og:title" content="Nomad Sofa">' } : undefined),
      replace: (endpoint, tool, args) => {
        if (endpoint !== "global" || tool !== "search_catalog") return undefined;
        searches.push(args.catalog.query);
        // The plain link's lookup is recorded as not_found; answer the search with the sofa.
        return new RecordedTransport().call("global", "lookup_catalog", { catalog: { ids: [BURROW] } });
      },
    });
    const card = await runCheck(t, plain, "14228", saved);
    expect(searches).toEqual(["Nomad Sofa"]);
    expect(card.product.variantNote).toBe("Your link didn't name a fabric, so this shows Crushed Gravel - Performance Chenille.");
    expect(card.steps[0]).toMatchObject({ tool: "search_catalog", summary: expect.stringContaining("The link named no variant") });
  });

  it("gives up when no listing from the linked store matches", async () => {
    const t = faulty({
      page: (url) => ({ url, html: "<title>Nomad Sofa | Burrow</title>" }),
      replace: (endpoint, tool) => (endpoint === "global" && tool === "search_catalog" ? { structuredContent: { products: [] } } : undefined),
    });
    await expect(runCheck(t, plain, "14228", saved)).rejects.toMatchObject({ code: "not_found" });
  });
});
