// STAGE 2-3 STAND-IN for the "If you're wrong" row.
//
// Stage 4 replaces this file: the model extracts return terms from the policy
// page, with the assistant's answer as a second input (spec 7.5, 8.3), and
// `cost` computes the dollar figures. Until then these terms are written by
// hand for the two demo stores, in the shape stage 4 must produce.
//
// They still go through guardrail 1 on every check: a line whose quotes aren't
// found in the text actually read (live or recorded) is dropped as unknown.

import type { IfWrongRow, Quote, ReturnLine, ReturnsSources, ReturnWindow } from "../shared/card";
import { allQuotesHold, quoteHolds } from "./quotes";

const P = (text: string): Quote => ({ text, source: "policy" });
const A = (text: string): Quote => ({ text, source: "assistant" });

interface StandIn {
  /** Terms from the policy page, plus item-specific notes from the assistant. */
  fromPolicy: { lines: (deliveryCents: number | null) => ReturnLine[]; window: ReturnWindow };
  /** Terms from the assistant alone, for when the policy page can't be read. */
  fromAssistant: { lines: (deliveryCents: number | null) => ReturnLine[]; window: ReturnWindow };
}

const BURROW_FEE = [
  P("we charge a return shipping fee equal to 10% of what you paid for the product, with the original packaging intact"),
  P("If you don't have the original packaging, the fee is 20% of the paid value"),
  P("The fee is always capped at $250, per returned item"),
];

const BURROW_ASSISTANT_FEE = [
  A("the return fee is 10% of the amount paid with the original packaging intact, or 20% without it, capped at $250"),
  A("the fee is described as return shipping"),
];

function burrowLosses(quotes: Quote[]): ReturnLine[] {
  const base = { includesReturnShipping: true, includesDeliveryCents: 0, includesReturnShippingCents: 0, quotes };
  return [
    // 10% of $1,364
    { kind: "loss", condition: "with the original box", lossCents: 13640, fee: { type: "percent", percent: 10, capCents: null }, ...base },
    // 20% of $1,364 is $272.80, capped at $250
    { kind: "loss", condition: "without the box", lossCents: 25000, fee: { type: "percent", percent: 20, capCents: 25000 }, ...base },
  ];
}

const BURROW_DELIVERY = A("The information doesn’t say original delivery charges are refunded");

const GARVEE_FEE = [
  P("the buyer will be responsible for covering the cost of returning and restocking the item"),
  P("Receive the item but change your mind/Does not meet my expectations"),
];

const GARVEE_ASSISTANT_FEE = [
  A("you pay return shipping and the return/restocking cost, but no specific shipping amount or restocking-fee rate is given"),
];

const STAND_INS: Record<string, StandIn> = {
  "burrow-prod.myshopify.com": {
    fromPolicy: {
      lines: (deliveryCents) => [
        ...burrowLosses(BURROW_FEE),
        // The policy page is silent on delivery refunds; the assistant says so too.
        { kind: "delivery_refund_unstated", deliveryCents, quotes: [BURROW_DELIVERY] },
        {
          kind: "exchange",
          count: 1,
          conditions: "with the original box, within the 30 days",
          quotes: [P("we offer one free exchange within the 30-day return window, with original packaging")],
        },
        // Whether this item is final sale is item-specific: only the assistant can say.
        { kind: "final_sale", value: false, quotes: [A("this item is not identified as final sale")] },
      ],
      window: {
        days: 30,
        starts: "confirmed delivery",
        quotes: [
          P("The return process must be initiated within 30 calendar days of receipt for all products"),
          P("Receipt is when the last package for an individual product is delivered per shipping carrier confirmation and not when the order is unboxed"),
        ],
      },
    },
    fromAssistant: {
      lines: (deliveryCents) => [
        ...burrowLosses(BURROW_ASSISTANT_FEE),
        { kind: "delivery_refund_unstated", deliveryCents, quotes: [BURROW_DELIVERY] },
        {
          kind: "exchange",
          count: 1,
          conditions: "with the original box, within the 30 days",
          quotes: [A("One free exchange is available within the 30-day window if the original packaging is intact")],
        },
        { kind: "final_sale", value: false, quotes: [A("this item is not identified as final sale")] },
      ],
      window: {
        days: 30,
        starts: "confirmed delivery",
        quotes: [A("You can start a return within 30 calendar days of delivery confirmed by the carrier")],
      },
    },
  },
  "mygarvee.myshopify.com": {
    fromPolicy: {
      lines: () => [
        { kind: "fee_unstated", quotes: GARVEE_FEE },
        { kind: "return_shipping_unstated", quotes: GARVEE_FEE },
      ],
      window: {
        days: 30,
        starts: null,
        quotes: [P("you have the option to return it within 30 days for a replacement or a refund, whichever you prefer")],
      },
    },
    fromAssistant: {
      lines: () => [
        { kind: "fee_unstated", quotes: GARVEE_ASSISTANT_FEE },
        { kind: "return_shipping_unstated", quotes: GARVEE_ASSISTANT_FEE },
      ],
      window: {
        days: 30,
        starts: null,
        quotes: [A("The 30-day return window applies, but the information doesn’t clarify whether it starts at delivery or another date")],
      },
    },
  },
};

const COST_LINES = new Set<ReturnLine["kind"]>(["loss", "fee_unstated", "return_shipping_unstated"]);

export function standInReturns(storeDomain: string, sources: ReturnsSources, deliveryCents: number | null): IfWrongRow {
  const { policy, assistant } = sources;
  if (policy.status !== "read" && assistant.status !== "answered") {
    return { status: "unreadable", reason: "Neither the policy page nor the store's assistant could be read.", sources };
  }

  const standIn = STAND_INS[storeDomain];
  if (!standIn) {
    return { status: "unreadable", reason: "Reading terms for any store arrives with model extraction in stage 4.", sources };
  }

  const terms = policy.status === "read" ? standIn.fromPolicy : standIn.fromAssistant;
  const lines = terms
    .lines(deliveryCents)
    // Free delivery has nothing to refund.
    .filter((l) => l.kind !== "delivery_refund_unstated" || l.deliveryCents !== 0)
    // "Refund not stated" is a claim of silence and stands without a quote;
    // the assistant's words only support it.
    .map((l) => (l.kind === "delivery_refund_unstated" ? { ...l, quotes: l.quotes.filter((q) => quoteHolds(q, sources)) } : l))
    .filter((l) => allQuotesHold(l.quotes, sources));
  const window = allQuotesHold(terms.window.quotes, sources) ? terms.window : null;

  if (!lines.some((l) => COST_LINES.has(l.kind))) {
    return { status: "unreadable", reason: "The store's text no longer matches the terms this prototype expects.", sources };
  }
  return { status: "terms", lines, window, sources };
}
