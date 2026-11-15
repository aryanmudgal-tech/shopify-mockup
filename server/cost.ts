// Spec 7.5: code does all arithmetic. Turns reconciled terms and the prices
// the check found into the lines of the "If you're wrong" row.
//
//   fee for a condition = item price × percent, capped at the stated cap;
//                         a flat fee is the stated amount; no fee is $0
//   loss                = fee + delivery if the store says it isn't refunded
//                         + return shipping if a flat amount is stated and it
//                           isn't included in the fee
//   delivery refund unstated -> "+ $69 delivery, refund not stated", not added
//
// Two checks then make sure the figures account for the store's words, and the
// row fails closed if either fails: it shows the store's quotes and no figure.
//   1. Returning without the box can't cost less than returning with it.
//   2. Every dollar amount in the quoted cost sentences must be used in the
//      arithmetic, as an input or a result. An unused amount is a dropped charge.

import type { Fee as CardFee, IfWrongRow, Quote, ReturnLine, ReturnsSources, ReturnWindow } from "../shared/card";
import { formatUsd } from "../shared/money";
import type { Disagreement } from "./reconcile";
import type { Condition, Fee, SourcedTerms, WindowStart } from "./terms";

export interface Prices {
  /** What the buyer pays for the item, in cents. */
  itemCents: number;
  /** The cart's delivery charge in cents; null when the cart couldn't price it. */
  deliveryCents: number | null;
}

const dollarsToCents = (dollars: number) => Math.round(dollars * 100);

/** The fee in cents for one condition; null when the store charges one but states no amount. */
export function feeCents(fee: Fee, itemCents: number): number | null {
  switch (fee.type) {
    case "percent": {
      if (fee.percent === null) return null;
      const raw = Math.round((itemCents * fee.percent) / 100);
      return fee.cap === null ? raw : Math.min(raw, dollarsToCents(fee.cap));
    }
    case "flat":
      return fee.amount === null ? null : dollarsToCents(fee.amount);
    case "none":
      return 0;
    case "charged_amount_unstated":
      return null;
  }
}

const CONDITION_ORDER: Condition[] = ["with_original_packaging", "without_original_packaging", "any"];

export const CONDITION_LABEL: Record<Condition, string | null> = {
  with_original_packaging: "with the original box",
  without_original_packaging: "without the box",
  any: null,
};

export const START_LABEL: Record<WindowStart, string> = {
  carrier_confirmed_delivery: "confirmed delivery",
  delivery: "delivery",
  purchase: "purchase",
  shipment: "shipment",
};

function cardFee(fee: Fee): CardFee {
  if (fee.type === "percent") return { type: "percent", percent: fee.percent ?? 0, capCents: fee.cap === null ? null : dollarsToCents(fee.cap) };
  if (fee.type === "flat") return { type: "flat", cents: dollarsToCents(fee.amount ?? 0) };
  return { type: "none" };
}

function uniqueQuotes(...lists: Quote[][]): Quote[] {
  const seen = new Set<string>();
  return lists.flat().filter((q) => {
    const key = `${q.source}:${q.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const COST_KINDS = new Set<ReturnLine["kind"]>(["loss", "fee_unstated", "return_shipping_unstated"]);

export function returnsRow(terms: SourcedTerms, disagreements: Disagreement[], prices: Prices, sources: ReturnsSources): IfWrongRow {
  if (terms.final_sale.value === true && terms.final_sale.quotes[0]) {
    return { status: "no_returns", quote: terms.final_sale.quotes[0], sources };
  }

  const rs = terms.return_shipping;
  const delivery = terms.original_delivery_refunded;
  const flatShippingCents = rs.type === "flat" && rs.amount !== null ? dollarsToCents(rs.amount) : 0;
  const keptDeliveryCents = delivery.value === false && prices.deliveryCents ? prices.deliveryCents : 0;
  const extraQuotes = uniqueQuotes(
    flatShippingCents ? rs.quotes : [],
    keptDeliveryCents ? delivery.quotes : [],
    rs.type === "included_in_fee" ? rs.quotes : [],
  );

  const lines: ReturnLine[] = [];
  const fees = [...terms.fees_by_condition]
    .sort((x, y) => CONDITION_ORDER.indexOf(x.condition) - CONDITION_ORDER.indexOf(y.condition))
    .map((f) => (sameCharge(f, rs) ? { ...f, fee: { type: "none" as const, percent: null, amount: null, cap: null } } : f));
  const unstatedFees = fees.filter((f) => feeCents(f.fee, prices.itemCents) === null);
  // The loss lines share one set of quotes, so the page shows the store's words
  // once under all of them (10% with the box, 20% without, capped at $250).
  const lossQuotes = uniqueQuotes(...fees.filter((f) => feeCents(f.fee, prices.itemCents) !== null).map((f) => f.quotes), extraQuotes);

  for (const entry of fees) {
    const fee = feeCents(entry.fee, prices.itemCents);
    if (fee === null) continue;
    lines.push({
      kind: "loss",
      condition: CONDITION_LABEL[entry.condition],
      lossCents: fee + flatShippingCents + keptDeliveryCents,
      fee: cardFee(entry.fee),
      includesReturnShipping: rs.type === "included_in_fee",
      includesDeliveryCents: keptDeliveryCents,
      includesReturnShippingCents: flatShippingCents,
      quotes: lossQuotes,
    });
  }

  // No fee stated, but a fixed cost or free return shipping is: one line for any return.
  if (fees.length === 0 && (flatShippingCents || keptDeliveryCents || rs.type === "free")) {
    lines.push({
      kind: "loss",
      condition: null,
      lossCents: flatShippingCents + keptDeliveryCents,
      fee: { type: "none" },
      includesReturnShipping: false,
      includesDeliveryCents: keptDeliveryCents,
      includesReturnShippingCents: flatShippingCents,
      quotes: uniqueQuotes(rs.quotes, extraQuotes),
    });
  }

  if (unstatedFees.length) lines.push({ kind: "fee_unstated", quotes: uniqueQuotes(...unstatedFees.map((f) => f.quotes)) });
  if (rs.type === "customer_pays_unstated") lines.push({ kind: "return_shipping_unstated", quotes: rs.quotes });
  if (delivery.value === null && prices.deliveryCents !== 0) {
    lines.push({ kind: "delivery_refund_unstated", deliveryCents: prices.deliveryCents, quotes: delivery.quotes });
  }

  const ex = terms.exchange;
  if (ex.free === true) {
    const days = terms.window.days;
    const conditions = [
      ex.needs_original_packaging ? "with the original box" : null,
      ex.within_return_window ? (days !== null ? `within the ${days} days` : "within the return window") : null,
    ].filter(Boolean);
    lines.push({ kind: "exchange", count: ex.count, conditions: conditions.join(", "), quotes: ex.quotes });
  }

  if (terms.final_sale.value === false) lines.push({ kind: "final_sale", value: false, quotes: terms.final_sale.quotes });

  for (const d of disagreements) lines.push({ kind: "disagreement", topic: d.topic, quotes: d.quotes });

  const w = terms.window;
  const window: ReturnWindow | null =
    w.days !== null || w.starts !== null ? { days: w.days, starts: w.starts ? START_LABEL[w.starts] : null, quotes: w.quotes } : null;

  // Fail closed when the figures don't account for the store's words.
  const used = [prices.itemCents, flatShippingCents, keptDeliveryCents];
  for (const f of fees) {
    if (f.fee.type === "flat" && f.fee.amount !== null) used.push(dollarsToCents(f.fee.amount));
    if (f.fee.cap !== null) used.push(dollarsToCents(f.fee.cap));
    const cents = feeCents(f.fee, prices.itemCents);
    if (cents !== null) used.push(cents);
  }
  const problem = arithmeticProblem(lines, used);
  if (problem) {
    return {
      status: "unverified",
      reason: problem,
      quotes: uniqueQuotes(...lines.filter((l) => COST_KINDS.has(l.kind)).map((l) => l.quotes)),
      // Only lines that carry no computed figure stay.
      lines: lines.filter((l) => l.kind === "exchange" || l.kind === "final_sale" || l.kind === "disagreement"),
      window,
      sources,
    };
  }

  if (!lines.some((l) => COST_KINDS.has(l.kind)) && disagreements.length === 0) {
    // Nothing about cost, but other terms are known: show them and say what's missing.
    if (window || lines.some((l) => l.kind === "exchange" || l.kind === "final_sale")) {
      return { status: "terms", lines: [{ kind: "cost_unstated", quotes: [] }, ...lines], window, sources };
    }
    return { status: "unreadable", reason: "Neither the policy nor the store's assistant says what a return costs.", sources };
  }

  return { status: "terms", lines, window, sources };
}

/**
 * One quoted charge is counted once. A flat fee that rests on the same
 * sentence and amount as the flat return shipping charge is that charge filed
 * twice (Sundays: "A flat rate return shipping fee of $150"), so the fee adds
 * nothing on top of the shipping.
 */
function sameCharge(f: SourcedTerms["fees_by_condition"][number], rs: SourcedTerms["return_shipping"]): boolean {
  if (rs.type !== "flat" || f.fee.type !== "flat" || f.fee.amount !== rs.amount) return false;
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  return f.quotes.some((fq) => rs.quotes.some((rq) => squash(rq.text).includes(squash(fq.text)) || squash(fq.text).includes(squash(rq.text))));
}

/** Dollar amounts written in a sentence, in cents: "$150", "$1,364", "$136.40". */
export function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)].map(
    (m) => Number(m[1]!.replace(/,/g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0")),
  );
}

/**
 * Why the figures can't be trusted, or null. `used` holds every amount the
 * arithmetic used: the price, flat charges, caps, kept delivery and the fees
 * it computed.
 */
export function arithmeticProblem(lines: ReturnLine[], used: number[]): string | null {
  const losses = lines.filter((l): l is Extract<ReturnLine, { kind: "loss" }> => l.kind === "loss");
  const withBox = losses.find((l) => l.condition === CONDITION_LABEL.with_original_packaging);
  const without = losses.find((l) => l.condition === CONDITION_LABEL.without_original_packaging);
  if (withBox && without && without.lossCents < withBox.lossCents) {
    return `Without the box came out cheaper (${formatUsd(without.lossCents)}) than with it (${formatUsd(withBox.lossCents)}), so a charge must be on the wrong line.`;
  }

  const accounted = new Set([...used, ...losses.map((l) => l.lossCents)]);
  const quoted = lines.filter((l) => COST_KINDS.has(l.kind)).flatMap((l) => l.quotes.flatMap((q) => dollarAmounts(q.text)));
  const unused = [...new Set(quoted.filter((cents) => !accounted.has(cents)))];
  if (unused.length) {
    return `The store's words mention ${unused.map(formatUsd).join(" and ")}, but the figures don't use ${unused.length > 1 ? "them" : "it"}, so a charge may have been dropped.`;
  }
  return null;
}
