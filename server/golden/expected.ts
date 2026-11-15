// Golden expectations for the two demo stores.
//
// These are the hand-written "If you're wrong" lines from the stage 2-3
// stand-ins (server/standins.ts, retired in stage 4), turned into expected
// outputs. Stage 4 passes only when model extraction + reconcile + cost
// reproduce them for both stores, recorded and live (server/golden.test.ts).
//
// The comparison covers what the buyer sees as figures and terms: amounts,
// conditions, fee rates and caps, the window, the exchange and final sale, and
// which source each line's quotes come from. Quote wording is not compared:
// the model may pick different exact passages, and every quote is checked
// against the text it claims to come from instead.
//
// One correction from the stand-in: Burrow's policy says "The fee is always
// capped at $250, per returned item", so the with-box fee carries the cap too.
// It doesn't bind ($136.40 is under it), so no figure changes.

import type { IfWrongRow, QuoteSource, ReturnLine, TryFirstRow } from "../../shared/card";

export type GoldenLine =
  | {
      kind: "loss";
      condition: string | null;
      lossCents: number;
      percent: number | null;
      capCents: number | null;
      includesReturnShipping: boolean;
      includesDeliveryCents: number;
      includesReturnShippingCents: number;
      sources: QuoteSource[];
    }
  | { kind: "fee_unstated"; sources: QuoteSource[] }
  | { kind: "return_shipping_unstated"; sources: QuoteSource[] }
  | { kind: "delivery_refund_unstated"; deliveryCents: number | null }
  | { kind: "exchange"; count: number | null; conditions: string; sources: QuoteSource[] }
  | { kind: "final_sale"; value: boolean; sources: QuoteSource[] }
  | { kind: "disagreement"; topic: string };

export interface GoldenReturns {
  status: IfWrongRow["status"];
  lines: GoldenLine[];
  window: { days: number | null; starts: string | null; sources: QuoteSource[] } | null;
}

export interface GoldenCase {
  link: string;
  zip: string;
  returns: GoldenReturns;
  sample: { variantId: string; title: string; priceCents: number } | null;
}

const uniq = (xs: QuoteSource[]) => [...new Set(xs)].sort();

/** The part of a returns row the golden test compares. */
export function goldenView(row: IfWrongRow): GoldenReturns {
  if (row.status !== "terms") return { status: row.status, lines: [], window: null };
  return {
    status: row.status,
    lines: row.lines.map(goldenLine),
    window: row.window
      ? { days: row.window.days, starts: row.window.starts, sources: uniq(row.window.quotes.map((q) => q.source)) }
      : null,
  };
}

function goldenLine(l: ReturnLine): GoldenLine {
  const sources = uniq(l.quotes.map((q) => q.source));
  switch (l.kind) {
    case "loss":
      return {
        kind: "loss",
        condition: l.condition,
        lossCents: l.lossCents,
        percent: l.fee.type === "percent" ? l.fee.percent : null,
        capCents: l.fee.type === "percent" ? l.fee.capCents : null,
        includesReturnShipping: l.includesReturnShipping,
        includesDeliveryCents: l.includesDeliveryCents,
        includesReturnShippingCents: l.includesReturnShippingCents,
        sources,
      };
    case "fee_unstated":
    case "return_shipping_unstated":
      return { kind: l.kind, sources };
    case "delivery_refund_unstated":
      // Its quotes only support a claim of silence, so they aren't compared.
      return { kind: l.kind, deliveryCents: l.deliveryCents };
    case "exchange":
      return { kind: l.kind, count: l.count, conditions: l.conditions, sources };
    case "final_sale":
      return { kind: l.kind, value: l.value, sources };
    case "disagreement":
      return { kind: l.kind, topic: l.topic };
  }
}

export function sampleView(row: TryFirstRow): GoldenCase["sample"] {
  return row.status === "sample" ? { variantId: row.variantId, title: row.title, priceCents: row.priceCents } : null;
}

export const GOLDEN: Record<"burrow" | "garvee", GoldenCase> = {
  burrow: {
    link: "https://burrow.com/products/nomad-plus-sofa?variant=50484946305326",
    zip: "14228",
    returns: {
      status: "terms",
      lines: [
        {
          kind: "loss",
          condition: "with the original box",
          lossCents: 13640, // 10% of $1,364
          percent: 10,
          capCents: 25000,
          includesReturnShipping: true,
          includesDeliveryCents: 0,
          includesReturnShippingCents: 0,
          sources: ["policy"],
        },
        {
          kind: "loss",
          condition: "without the box",
          lossCents: 25000, // 20% of $1,364 is $272.80, capped at $250
          percent: 20,
          capCents: 25000,
          includesReturnShipping: true,
          includesDeliveryCents: 0,
          includesReturnShippingCents: 0,
          sources: ["policy"],
        },
        { kind: "delivery_refund_unstated", deliveryCents: 6900 },
        { kind: "exchange", count: 1, conditions: "with the original box, within the 30 days", sources: ["policy"] },
        { kind: "final_sale", value: false, sources: ["assistant"] },
      ],
      window: { days: 30, starts: "confirmed delivery", sources: ["policy"] },
    },
    sample: {
      variantId: "gid://shopify/ProductVariant/50269421830446",
      title: "Crushed Gravel Performance Chenille",
      priceCents: 100,
    },
  },
  garvee: {
    link: "https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?variant=51296972898617",
    zip: "14228",
    returns: {
      status: "terms",
      lines: [
        { kind: "fee_unstated", sources: ["policy"] },
        { kind: "return_shipping_unstated", sources: ["policy"] },
      ],
      window: { days: 30, starts: null, sources: ["policy"] },
    },
    sample: null,
  },
};
