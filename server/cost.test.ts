import { describe, expect, it } from "vitest";
import type { Quote, ReturnsSources } from "../shared/card";
import { dollarAmounts, feeCents, returnsRow } from "./cost";
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

  it("is unreadable when nothing at all is known", () => {
    expect(returnsRow(terms({}), [], { itemCents: 1, deliveryCents: 0 }, SOURCES).status).toBe("unreadable");
  });
});

describe("arithmetic checks (fail closed)", () => {
  const S150 = P("A flat rate return shipping fee of $150 will be applied to your refund or exchange.");
  const S75 = P("If you do not have the original packaging, a return re-packaging fee of $75 will be applied to your refund or exchange.");
  const flat = (amount: number) => ({ type: "flat" as const, percent: null, amount, cap: null });
  const none = { type: "none" as const, percent: null, amount: null, cap: null };

  it("Sundays, read right: $150 shipping on every return, plus $75 without the box", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [
          { condition: "with_original_packaging", fee: none, quotes: [S75] },
          { condition: "without_original_packaging", fee: flat(75), quotes: [S75] },
        ],
        return_shipping: { type: "flat", amount: 150, quotes: [S150] },
      }),
      [],
      { itemCents: 380000, deliveryCents: 0 },
      SOURCES,
    );
    if (row.status !== "terms") throw new Error(row.status);
    expect(row.lines.filter((l) => l.kind === "loss").map((l) => (l.kind === "loss" ? [l.condition, l.lossCents] : null))).toEqual([
      ["with the original box", 15000],
      ["without the box", 22500],
    ]);
  });

  it("Sundays, read wrong ($150 filed as the with-box fee): without the box comes out cheaper, so it fails closed", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [
          { condition: "with_original_packaging", fee: flat(150), quotes: [S150] },
          { condition: "without_original_packaging", fee: flat(75), quotes: [S75] },
        ],
      }),
      [],
      { itemCents: 380000, deliveryCents: 0 },
      SOURCES,
    );
    expect(row).toMatchObject({ status: "unverified", reason: expect.stringContaining("cheaper"), quotes: [S150, S75] });
    // No figure survives: only lines without a computed amount.
    if (row.status === "unverified") expect(row.lines).toEqual([]);
  });

  it("fails closed when a quoted dollar amount isn't used (a dropped charge)", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [
          { condition: "any", fee: flat(99), quotes: [P("A $99 return fee will be deducted, plus a $50 pickup charge.")] },
        ],
      }),
      [],
      { itemCents: 99700, deliveryCents: 0 },
      SOURCES,
    );
    expect(row).toMatchObject({ status: "unverified", reason: expect.stringContaining("$50") });
  });

  it("counts the price, a cap and a store-computed figure as used", () => {
    const row = returnsRow(
      terms({
        fees_by_condition: [
          {
            condition: "with_original_packaging",
            fee: { type: "percent", percent: 10, amount: null, cap: 250 },
            quotes: [P("On its listed $1,364 price, that would be $136.40, capped at $250")],
          },
        ],
      }),
      [],
      { itemCents: 136400, deliveryCents: 0 },
      SOURCES,
    );
    expect(row.status).toBe("terms");
  });

  it("shows a known window when nothing says what a return costs", () => {
    const row = returnsRow(
      terms({ window: { days: 5, starts: "delivery", quotes: [P("within the first 5 days")] } }),
      [],
      { itemCents: 48999, deliveryCents: null },
      SOURCES,
    );
    expect(row).toMatchObject({
      status: "terms",
      lines: [{ kind: "cost_unstated" }, { kind: "delivery_refund_unstated", deliveryCents: null }],
      window: { days: 5 },
    });
  });
});

describe("dollarAmounts", () => {
  it("reads whole, comma and cent amounts", () => {
    expect(dollarAmounts("a $150 fee, $1,364 listed, $136.40 back, 30 days, 10%")).toEqual([15000, 136400, 13640]);
  });
});

describe("one quoted charge is counted once", () => {
  it("Sundays, $150 filed as both the with-box fee and return shipping: counted once, $150 and $225", () => {
    const S150 = P("A flat rate return shipping fee of $150 will be applied to your refund or exchange.");
    const S75 = P("If you do not have the original packaging, a return re-packaging fee of $75 will be applied to your refund or exchange.");
    const row = returnsRow(
      terms({
        fees_by_condition: [
          { condition: "with_original_packaging", fee: { type: "flat", percent: null, amount: 150, cap: null }, quotes: [P("A flat rate return shipping fee of $150 will be applied to your refund")] },
          { condition: "without_original_packaging", fee: { type: "flat", percent: null, amount: 75, cap: null }, quotes: [S75] },
        ],
        return_shipping: { type: "flat", amount: 150, quotes: [S150] },
      }),
      [],
      { itemCents: 380000, deliveryCents: 0 },
      SOURCES,
    );
    if (row.status !== "terms") throw new Error(`${row.status}: ${"reason" in row ? row.reason : ""}`);
    expect(row.lines.filter((l) => l.kind === "loss").map((l) => (l.kind === "loss" ? l.lossCents : 0))).toEqual([15000, 22500]);
  });
});
