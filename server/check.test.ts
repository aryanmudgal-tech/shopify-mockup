// The whole check on recorded responses, and on a transport with injected
// failures: each part must fail on its own (spec 6.3 empty states).

import { describe, expect, it } from "vitest";
import { runCheck } from "./check";
import { RECORDED_LINKS, RecordedTransport } from "./ucp/recorded";
import type { CallOptions, Endpoint, Page, Transport, UcpResult } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

const [BURROW, GARVEE] = RECORDED_LINKS as [string, string];

/** Recorded responses, except for the calls told to fail or to be replaced. */
class Faulty implements Transport {
  readonly mode = "recorded" as const;
  readonly recordedAt = null;
  private inner = new RecordedTransport();
  constructor(
    private faults: {
      tools?: string[];
      pages?: boolean;
      replace?: (endpoint: Endpoint, tool: string, args: any) => UcpResult | undefined;
      page?: (url: string) => Page | undefined;
    },
  ) {}
  async call(endpoint: Endpoint, tool: string, args: Record<string, unknown>, opts?: CallOptions): Promise<UcpResult> {
    if (this.faults.tools?.includes(tool)) throw new UcpError("upstream", `${tool} timed out`);
    return this.faults.replace?.(endpoint, tool, args) ?? this.inner.call(endpoint, tool, args, opts);
  }
  async fetchPage(url: string): Promise<Page> {
    const page = this.faults.page?.(url);
    if (page) return page;
    if (this.faults.pages) throw new UcpError("upstream", "checkout.shopify.com answered HTTP 503.");
    return this.inner.fetchPage(url);
  }
}

describe("runCheck on recorded responses", () => {
  it("builds Burrow's card", async () => {
    const card = await runCheck(new RecordedTransport(), BURROW, "14228");

    expect(card.product).toMatchObject({ title: "Nomad Sofa", seller: { name: "Burrow" }, rating: { value: 3.8, count: 18 } });
    expect(card.product.checkoutUrl).toContain("burrow-prod.myshopify.com/buy/50484946305326:1");
    expect(card.toBuy).toEqual({ status: "priced", listedCents: 136400, deliveryCents: 6900, deliveryLabel: "Standard Shipping", doorCents: 143300 });
    expect(card.tryFirst).toMatchObject({
      status: "sample",
      title: "Crushed Gravel Performance Chenille",
      priceCents: 100,
      checkoutUrl: "https://burrow-prod.myshopify.com/cart/50269421830446:1",
    });
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { policy: { status: "read" }, assistant: { status: "answered" } } });
    expect(card.steps.map((s) => [s.id, s.outcome])).toEqual([
      ["identify", "ok"],
      ["price", "ok"],
      ["sample", "ok"],
      ["policy", "ok"],
      ["assistant", "ok"],
    ]);
    expect(card.steps.find((s) => s.id === "policy")!.detail?.kind).toBe("policy");
    expect(card.steps.find((s) => s.id === "assistant")!.detail?.kind).toBe("assistant");
  });

  it("builds Garvee's card with no sample and unstated fees", async () => {
    const card = await runCheck(new RecordedTransport(), GARVEE, "14228");
    expect(card.product.seller.name).toBe("GARVEE");
    expect(card.toBuy).toMatchObject({ status: "priced", deliveryCents: 0, doorCents: 68199 });
    expect(card.tryFirst).toEqual({ status: "none" });
    expect(card.steps.find((s) => s.id === "sample")).toMatchObject({ outcome: "empty", summary: expect.stringContaining('"Corduroy swatch" (10 results)') });
    expect(card.ifWrong.status === "terms" && card.ifWrong.lines.map((l) => l.kind)).toEqual(["fee_unstated", "return_shipping_unstated"]);
  });

  it("refuses links and ZIPs that were never recorded", async () => {
    await expect(runCheck(new RecordedTransport(), "https://example.com/products/x", "14228")).rejects.toMatchObject({ code: "not_recorded" });
    await expect(runCheck(new RecordedTransport(), BURROW, "10001")).rejects.toMatchObject({ code: "not_recorded" });
  });
});

describe("runCheck when parts fail", () => {
  it("keeps the card when the cart and the sample search fail", async () => {
    const card = await runCheck(new Faulty({ tools: ["create_cart", "search_catalog"] }), BURROW, "14228");
    expect(card.toBuy).toMatchObject({ status: "unavailable", reason: expect.stringContaining("create_cart timed out") });
    expect(card.tryFirst).toMatchObject({ status: "unavailable" });
    expect(card.ifWrong.status).toBe("terms");
    // Without a delivery figure the line still says the refund isn't stated.
    expect(card.ifWrong.status === "terms" && card.ifWrong.lines.find((l) => l.kind === "delivery_refund_unstated")).toMatchObject({ deliveryCents: null });
    expect(card.steps.filter((s) => s.outcome === "failed").map((s) => s.id)).toEqual(["price", "sample"]);
  });

  it("uses the assistant alone when the policy page can't be read", async () => {
    const card = await runCheck(new Faulty({ pages: true }), BURROW, "14228");
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { policy: { status: "failed", reason: expect.stringContaining("503") } } });
    expect(card.steps.find((s) => s.id === "policy")!.outcome).toBe("failed");
  });

  it("uses the policy alone when the store offers no ask_business", async () => {
    const t = new Faulty({ replace: (_e, tool) => (tool === "tools/list" ? { tools: [{ name: "search_catalog" }] } : undefined) });
    const card = await runCheck(t, BURROW, "14228");
    expect(card.ifWrong).toMatchObject({ status: "terms", sources: { assistant: { status: "not_offered" } } });
    expect(card.steps.find((s) => s.id === "assistant")!.outcome).toBe("empty");
  });
});

describe("findProduct fallback", () => {
  it("searches the Catalog for the page's title when the link doesn't resolve", async () => {
    const plain = "https://burrow.com/products/nomad-plus-sofa";
    const searches: string[] = [];
    const t = new Faulty({
      page: (url) => (url === plain ? { url, html: '<meta property="og:title" content="Nomad Sofa">' } : undefined),
      replace: (endpoint, tool, args) => {
        if (endpoint !== "global" || tool !== "search_catalog") return undefined;
        searches.push(args.catalog.query);
        return new RecordedTransport().call("global", "lookup_catalog", { catalog: { ids: [RECORDED_LINKS[0]] } }) as any;
      },
    });
    // The recorded lookup for the plain link returns not_found, as Global Catalog did.
    const card = await runCheck(t, plain, "14228");
    expect(searches).toEqual(["Nomad Sofa"]);
    expect(card.product.title).toBe("Nomad Sofa");
    expect(card.steps[0]).toMatchObject({ tool: "search_catalog", summary: expect.stringContaining('"Nomad Sofa"') });
    expect(card.steps[0]!.summary).toContain("The link named no variant");
  });

  it("gives up when no listing from the linked store matches", async () => {
    const t = new Faulty({
      page: (url) => ({ url, html: "<title>Nomad Sofa | Burrow</title>" }),
      replace: (endpoint, tool) => (endpoint === "global" && tool === "search_catalog" ? { structuredContent: { products: [] } } : undefined),
    });
    await expect(runCheck(t, "https://burrow.com/products/nomad-plus-sofa", "14228")).rejects.toMatchObject({ code: "not_found" });
  });
});
