// STAGE 2 STAND-IN for the "If you're wrong" row.
//
// Stage 4 replaces this file: the model extracts return terms from the store's
// answer (spec 8.3) and `cost` computes the dollar figures. Until then these
// rows are written by hand from the recorded answers, in the same shape stage 4
// must produce. The figures follow spec 7.5 and docs/verification.md, and every
// quote is checked against the recorded answer in standins.test.ts.

import type { IfWrongRow, ReturnLine } from "../shared/card";

interface StandIn {
  lines: (deliveryCents: number) => ReturnLine[];
  window: { days: number | null; starts: string | null; quote: string };
}

const BURROW_FEE = [
  "the return fee is 10% of the amount paid with the original packaging intact, or 20% without it, capped at $250",
  "the fee is described as return shipping",
];

const GARVEE_FEE = [
  "you pay return shipping and the return/restocking cost, but no specific shipping amount or restocking-fee rate is given",
];

const STAND_INS: Record<string, StandIn> = {
  "burrow-prod.myshopify.com": {
    lines: (deliveryCents) => [
      {
        kind: "loss",
        condition: "with the original box",
        lossCents: 13640, // 10% of $1,364
        fee: { type: "percent", percent: 10, capCents: null },
        includesReturnShipping: true,
        includesDeliveryCents: 0,
        includesReturnShippingCents: 0,
        quotes: BURROW_FEE,
      },
      {
        kind: "loss",
        condition: "without the box",
        lossCents: 25000, // 20% of $1,364 is $272.80, capped at $250
        fee: { type: "percent", percent: 20, capCents: 25000 },
        includesReturnShipping: true,
        includesDeliveryCents: 0,
        includesReturnShippingCents: 0,
        quotes: BURROW_FEE,
      },
      {
        kind: "delivery_refund_unstated",
        deliveryCents,
        quotes: ["The information doesn’t say original delivery charges are refunded"],
      },
      {
        kind: "exchange",
        conditions: "with the original box, within the 30 days",
        quotes: ["One free exchange is available within the 30-day window if the original packaging is intact"],
      },
    ],
    window: {
      days: 30,
      starts: "confirmed delivery",
      quote: "You can start a return within 30 calendar days of delivery confirmed by the carrier",
    },
  },
  "mygarvee.myshopify.com": {
    lines: () => [
      { kind: "fee_unstated", quotes: GARVEE_FEE },
      { kind: "return_shipping_unstated", quotes: GARVEE_FEE },
    ],
    window: {
      days: 30,
      starts: null,
      quote: "The 30-day return window applies, but the information doesn’t clarify whether it starts at delivery or another date",
    },
  },
};

export function standInReturns(
  storeDomain: string,
  raw: string,
  deliveryCents: number,
  policyUrl: string | null,
): IfWrongRow {
  const standIn = STAND_INS[storeDomain];
  if (!standIn) return { status: "unreadable", source: "answer", policyUrl, raw };
  return {
    status: "terms",
    source: "answer",
    // Free delivery has nothing to refund, so its line drops out.
    lines: standIn.lines(deliveryCents).filter((l) => l.kind !== "delivery_refund_unstated" || l.deliveryCents > 0),
    window: standIn.window,
    policyUrl,
    raw,
  };
}
