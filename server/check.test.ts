// The whole check on recorded responses: the card must show the values from
// the verification run (spec 6.3, docs/verification.md).

import { describe, expect, it } from "vitest";
import { runCheck } from "./check";
import { RECORDED_LINKS, RecordedTransport } from "./ucp/recorded";

const [BURROW, GARVEE] = RECORDED_LINKS as [string, string];

describe("runCheck on recorded responses", () => {
  it("builds Burrow's card", async () => {
    const card = await runCheck(new RecordedTransport(), BURROW, "14228");

    expect(card.product.title).toBe("Nomad Sofa");
    expect(card.product.seller.name).toBe("Burrow");
    expect(card.product.rating).toEqual({ value: 3.8, scaleMax: 5, count: 18 });
    expect(card.product.checkoutUrl).toContain("burrow-prod.myshopify.com/buy/50484946305326:1");

    expect(card.toBuy).toEqual({
      status: "priced",
      listedCents: 136400,
      deliveryCents: 6900,
      deliveryLabel: "Standard Shipping",
      doorCents: 143300,
    });

    expect(card.tryFirst).toMatchObject({
      status: "sample",
      title: "Crushed Gravel Performance Chenille",
      priceCents: 100,
      matchedOn: "Crushed Gravel - Performance Chenille",
      checkoutUrl: "https://burrow-prod.myshopify.com/cart/50269421830446:1",
    });

    expect(card.ifWrong.status).toBe("terms");
    if (card.ifWrong.status === "terms") {
      expect(card.ifWrong.lines.map((l) => l.kind)).toEqual(["loss", "loss", "delivery_refund_unstated", "exchange"]);
      expect(card.ifWrong.policyUrl).toContain("checkout.shopify.com/93232202030/policies");
    }

    expect(card.steps.map((s) => s.outcome)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("builds Garvee's card with no sample and unstated fees", async () => {
    const card = await runCheck(new RecordedTransport(), GARVEE, "14228");

    expect(card.product.seller.name).toBe("GARVEE");
    expect(card.toBuy).toMatchObject({ status: "priced", deliveryCents: 0, doorCents: 68199 });
    expect(card.tryFirst).toEqual({ status: "none" });

    const sample = card.steps.find((s) => s.id === "sample")!;
    expect(sample.outcome).toBe("empty");
    expect(sample.summary).toContain('"Corduroy swatch" (10 results)');

    expect(card.ifWrong.status).toBe("terms");
    if (card.ifWrong.status === "terms") {
      // Free delivery has nothing to refund, so no delivery line.
      expect(card.ifWrong.lines.map((l) => l.kind)).toEqual(["fee_unstated", "return_shipping_unstated"]);
    }
  });

  it("reports not_found for Burrow's link without ?variant=, as Global Catalog did", async () => {
    await expect(
      runCheck(new RecordedTransport(), "https://burrow.com/products/nomad-plus-sofa", "14228"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses links and ZIPs that were never recorded", async () => {
    await expect(runCheck(new RecordedTransport(), "https://example.com/products/x", "14228")).rejects.toMatchObject({
      code: "not_recorded",
    });
    await expect(runCheck(new RecordedTransport(), BURROW, "10001")).rejects.toMatchObject({ code: "not_recorded" });
  });
});
