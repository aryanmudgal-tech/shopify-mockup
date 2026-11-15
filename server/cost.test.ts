import { describe, expect, it } from "vitest";
import type { Quote, ReturnsSources } from "../shared/card";
import { feeCents, returnsRow } from "./cost";
import { emptyTerms, type SourcedTerms } from "./terms";

const P = (text: string): Quote => ({ text, source: "policy" });
const SOURCES: ReturnsSources = { policy: { status: "read", url: "#", text: "" }, assistant: { status: "not_offered" } };

function terms(patch: Partial<SourcedTerms>): SourcedTerms {
  return { ...emptyTerms<Quote>(), ...patch };
}

describe("feeCents", () => {
  it("takes a percent of the item price, capped at the stated cap", () => {
    expect(feeCents({ type: "percent", percent: 10, amount: null, cap: 250 }, 136400)).toBe(13640);
    expect(feeCents({ type: "percent", percent: 20, amount: null, cap: 250 }, 136400)).toBe(25000);
    expect(feeCents({ type: "percent", percent: 20, amount: null, cap: null }, 136400)).toBe(27280);
  });

  it("rounds to the cent", () => {
    expect(feeCents({ type: "percent", percent: 15, amount: null, cap: null }, 68199)).toBe(10230); // 10229.85
  });

  it("uses a flat amount as stated, zero for none, null when unstated", () => {
    expect(feeCents({ type: "flat", percent: null, amount: 49.5, cap: null }, 99900)).toBe(4950);
    expect(feeCents({ type: "none", percent: null, amount: null, cap: null }, 99900)).toBe(0);
    expect(feeCents({ type: "charged_amount_unstated", percent: null, amount: null, cap: null }, 99900)).toBeNull();
  });
});

describe("returnsRow", () => {
  const burrowFees: SourcedTerms["fees_by_condition"] = [
    { condition: "without_original_packaging", fee: { type: "percent", percent: 20, amount: null, cap: 250 }, quotes: [P("20%")] },
    { condition: "with_original_packaging", fee: { type: "percent", percent: 10, amount: null, cap: 250 }, quotes: [P("10%")] },
  ];

  it("Burrow: two losses in box order, fee includes return shipping, delivery refund unstated", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: burrowFees,
        return_shipping: { type: "included_in_fee", amount: null, quotes: [P("return shipping fee")] },
        window: { days: 30, starts: "carrier_confirmed_delivery", quotes: [P("30 calendar days")] },
        exchange: { free: true, count: 1, needs_original_packaging: true, within_return_window: true, quotes: [P("one free exchange")] },
      }),
      [],
      { itemCents: 136400, deliveryCents: 6900 },
      SOURCES,
    );
    expect(row.status).toBe("terms");
    if (row.status !== "terms") return;
    expect(row.lines.map((l) => (l.kind === "loss" ? [l.condition, l.lossCents, l.includesReturnShipping] : l.kind))).toEqual([
      ["with the original box", 13640, true],
      ["without the box", 25000, true],
      "delivery_refund_unstated",
      "exchange",
    ]);
    expect(row.lines[3]).toMatchObject({ count: 1, conditions: "with the original box, within the 30 days" });
    expect(row.window).toMatchObject({ days: 30, starts: "confirmed delivery" });
  });

  it("adds delivery the store keeps and a flat return shipping charge into the loss", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [{ condition: "any", fee: { type: "percent", percent: 15, amount: null, cap: null }, quotes: [P("15%")] }],
        return_shipping: { type: "flat", amount: 199, quotes: [P("$199")] },
        original_delivery_refunded: { value: false, quotes: [P("non-refundable")] },
      }),
      [],
      { itemCents: 100000, deliveryCents: 14900 },
      SOURCES,
    );
    if (row.status !== "terms") throw new Error(row.status);
    expect(row.lines[0]).toMatchObject({
      kind: "loss",
      condition: null,
      lossCents: 15000 + 19900 + 14900,
      includesDeliveryCents: 14900,
      includesReturnShippingCents: 19900,
    });
    // No delivery line: the store said it keeps delivery, and that's inside the figure.
    expect(row.lines.map((l) => l.kind)).toEqual(["loss"]);
  });

  it("Garvee: fee and return shipping charged, neither amount stated; free delivery has no refund line", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [{ condition: "any", fee: { type: "charged_amount_unstated", percent: null, amount: null, cap: null }, quotes: [P("restocking")] }],
        return_shipping: { type: "customer_pays_unstated", amount: null, quotes: [P("returning")] },
        window: { days: 30, starts: null, quotes: [P("30 days")] },
      }),
      [],
      { itemCents: 68199, deliveryCents: 0 },
      SOURCES,
    );
    if (row.status !== "terms") throw new Error(row.status);
    expect(row.lines.map((l) => l.kind)).toEqual(["fee_unstated", "return_shipping_unstated"]);
    expect(row.window).toMatchObject({ days: 30, starts: null });
  });

  it("says the delivery refund isn't stated even when the cart couldn't price delivery", () => {
    const row = returnsRow(
      terms({ fees_by_condition: [{ condition: "any", fee: { type: "none", percent: null, amount: null, cap: null }, quotes: [P("no fee")] }] }),
      [],
      { itemCents: 50000, deliveryCents: null },
      SOURCES,
    );
    if (row.status !== "terms") throw new Error(row.status);
    expect(row.lines.find((l) => l.kind === "delivery_refund_unstated")).toMatchObject({ deliveryCents: null });
  });

  it("is no_returns when the item is final sale", () => {
    const row = returnsRow(terms({ final_sale: { value: true, quotes: [P("final sale")] } }), [], { itemCents: 1, deliveryCents: 0 }, SOURCES);
    expect(row).toMatchObject({ status: "no_returns", quote: P("final sale") });
  });

  it("keeps a disagreement as its own line and computes nothing from it", () => {
    const row = returnsRow(terms({}), [{ topic: "the return fee", quotes: [P("10%")] }], { itemCents: 1, deliveryCents: 0 }, SOURCES);
    if (row.status !== "terms") throw new Error(row.status);
    expect(row.lines).toEqual([{ kind: "disagreement", topic: "the return fee", quotes: [P("10%")] }]);
  });

  it("is unreadable when neither source says what a return costs", () => {
    expect(returnsRow(terms({}), [], { itemCents: 1, deliveryCents: 0 }, SOURCES).status).toBe("unreadable");
  });
});
