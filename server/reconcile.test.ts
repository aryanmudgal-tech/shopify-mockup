import { describe, expect, it } from "vitest";
import type { Quote } from "../shared/card";
import { feesDiffer, reconcile } from "./reconcile";
import { emptyTerms, type Fee, type SourcedTerms } from "./terms";

const P = (text: string): Quote => ({ text, source: "policy" });
const A = (text: string): Quote => ({ text, source: "assistant" });
const t = (patch: Partial<SourcedTerms>): SourcedTerms => ({ ...emptyTerms<Quote>(), ...patch });
const fee = (type: Fee["type"], percent: number | null = null, cap: number | null = null, amount: number | null = null): Fee => ({
  type,
  percent,
  amount,
  cap,
});

describe("reconcile", () => {
  it("lets the policy win and the assistant fill what the policy doesn't say", () => {
    const { terms, disagreements } = reconcile(
      t({ window: { days: 30, starts: "carrier_confirmed_delivery", quotes: [P("30 days of receipt")] } }),
      t({
        window: { days: 30, starts: "delivery", quotes: [A("30 days of delivery")] },
        final_sale: { value: false, quotes: [A("not final sale")] },
      }),
    );
    expect(disagreements).toEqual([]);
    expect(terms.window).toEqual({ days: 30, starts: "carrier_confirmed_delivery", quotes: [P("30 days of receipt")] });
    expect(terms.final_sale).toEqual({ value: false, quotes: [A("not final sale")] });
  });

  it("flags a window both sources state differently, and drops it", () => {
    const { terms, disagreements } = reconcile(
      t({ window: { days: 14, starts: null, quotes: [P("14 days")] } }),
      t({ window: { days: 30, starts: null, quotes: [A("30 days")] } }),
    );
    expect(disagreements).toEqual([{ topic: "how many days you have to return it", quotes: [P("14 days"), A("30 days")] }]);
    expect(terms.window.days).toBeNull();
  });

  it("flags a fee rate that differs for the same condition, per condition", () => {
    const { terms, disagreements } = reconcile(
      t({
        fees_by_condition: [
          { condition: "with_original_packaging", fee: fee("percent", 10, 250), quotes: [P("10%")] },
          { condition: "without_original_packaging", fee: fee("percent", 20, 250), quotes: [P("20%")] },
        ],
      }),
      t({
        fees_by_condition: [
          { condition: "with_original_packaging", fee: fee("percent", 10, null), quotes: [A("10%")] },
          { condition: "without_original_packaging", fee: fee("percent", 25, null), quotes: [A("25%")] },
        ],
      }),
    );
    expect(disagreements.map((d) => d.topic)).toEqual(["the return fee without the box"]);
    // The assistant leaving out the cap is silence, not a contradiction.
    expect(terms.fees_by_condition.map((f) => f.condition)).toEqual(["with_original_packaging"]);
  });

  it("compares an assistant condition against the policy's any-condition fee", () => {
    const { disagreements } = reconcile(
      t({ fees_by_condition: [{ condition: "any", fee: fee("percent", 15), quotes: [P("15%")] }] }),
      t({ fees_by_condition: [{ condition: "without_original_packaging", fee: fee("percent", 20), quotes: [A("20%")] }] }),
    );
    expect(disagreements.map((d) => d.topic)).toEqual(["the return fee without the box"]);
  });

  it("takes the assistant's amount when the policy only says a fee is charged", () => {
    const { terms, disagreements } = reconcile(
      t({ fees_by_condition: [{ condition: "any", fee: fee("charged_amount_unstated"), quotes: [P("restocking fee")] }] }),
      t({ fees_by_condition: [{ condition: "any", fee: fee("percent", 15), quotes: [A("15% restocking")] }] }),
    );
    expect(disagreements).toEqual([]);
    expect(terms.fees_by_condition[0]!.quotes).toEqual([A("15% restocking")]);
  });

  it("flags who pays return shipping, a delivery refund, an exchange and final sale when they conflict", () => {
    const { disagreements } = reconcile(
      t({
        return_shipping: { type: "free", amount: null, quotes: [P("free returns")] },
        original_delivery_refunded: { value: false, quotes: [P("delivery not refunded")] },
        exchange: { free: true, count: 1, needs_original_packaging: null, within_return_window: null, quotes: [P("free exchange")] },
        final_sale: { value: true, quotes: [P("final sale")] },
      }),
      t({
        return_shipping: { type: "customer_pays_unstated", amount: null, quotes: [A("you pay shipping")] },
        original_delivery_refunded: { value: true, quotes: [A("delivery refunded")] },
        exchange: { free: false, count: null, needs_original_packaging: null, within_return_window: null, quotes: [A("exchanges cost")] },
        final_sale: { value: false, quotes: [A("not final sale")] },
      }),
    );
    expect(disagreements.map((d) => d.topic)).toEqual([
      "who pays return shipping",
      "whether delivery is refunded",
      "whether an exchange is free",
      "whether this item is final sale",
    ]);
  });

  it("treats a stated flat return shipping charge as fitting 'you pay, amount unstated'", () => {
    const { terms, disagreements } = reconcile(
      t({ return_shipping: { type: "customer_pays_unstated", amount: null, quotes: [P("buyer pays")] } }),
      t({ return_shipping: { type: "flat", amount: 99, quotes: [A("$99")] } }),
    );
    expect(disagreements).toEqual([]);
    expect(terms.return_shipping).toMatchObject({ type: "flat", amount: 99 });
  });

  it("uses whichever source exists when only one was read", () => {
    const only = t({ final_sale: { value: true, quotes: [A("final sale")] } });
    expect(reconcile(null, only)).toEqual({ terms: only, disagreements: [] });
  });
});

describe("feesDiffer", () => {
  it("treats an unstated amount as fitting any charged fee, but not no fee", () => {
    expect(feesDiffer(fee("charged_amount_unstated"), fee("percent", 15))).toBe(false);
    expect(feesDiffer(fee("charged_amount_unstated"), fee("none"))).toBe(true);
    expect(feesDiffer(fee("flat", null, null, 49), fee("flat", null, null, 59))).toBe(true);
  });
});
