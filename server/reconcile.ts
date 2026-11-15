// Disagreement detection (stage 4). The model extracts terms from the policy
// page and from the assistant's answer separately; this code compares them
// field by field and decides. If both sources state a value and the values
// differ, the field becomes a disagreement: the card shows both quotes, each
// with its label, and computes nothing from either.
//
// Otherwise the policy wins where it speaks, and the assistant fills fields the
// policy doesn't address (spec 7.5: final sale, item-specific terms, terms the
// page doesn't cover).

import type { Quote } from "../shared/card";
import type { Condition, Fee, SourcedTerms, Terms } from "./terms";
import { emptyTerms } from "./terms";

export interface Disagreement {
  topic: string;
  quotes: Quote[];
}

export interface Reconciled {
  terms: SourcedTerms;
  disagreements: Disagreement[];
}

const CONDITION_TOPIC: Record<Condition, string> = {
  with_original_packaging: "the return fee with the original box",
  without_original_packaging: "the return fee without the box",
  any: "the return fee",
};

export function reconcile(policy: SourcedTerms | null, assistant: SourcedTerms | null): Reconciled {
  if (!policy && !assistant) return { terms: emptyTerms(), disagreements: [] };
  if (!policy) return { terms: assistant!, disagreements: [] };
  if (!assistant) return { terms: policy, disagreements: [] };

  const disagreements: Disagreement[] = [];
  const disagree = (topic: string, quotes: Quote[]) => {
    if (!disagreements.some((d) => d.topic === topic)) disagreements.push({ topic, quotes });
  };

  return {
    terms: {
      window: mergeWindow(policy, assistant, disagree),
      fees_by_condition: mergeFees(policy, assistant, disagree),
      return_shipping: mergeReturnShipping(policy, assistant, disagree),
      original_delivery_refunded: mergeValue(policy.original_delivery_refunded, assistant.original_delivery_refunded, "whether delivery is refunded", disagree),
      exchange: mergeExchange(policy, assistant, disagree),
      final_sale: mergeValue(policy.final_sale, assistant.final_sale, "whether this item is final sale", disagree),
    },
    disagreements,
  };
}

type Disagree = (topic: string, quotes: Quote[]) => void;

/** A single stated value: policy wins, the assistant fills in, a conflict is a disagreement. */
function mergeValue<T extends { value: unknown; quotes: Quote[] }>(p: T, a: T, topic: string, disagree: Disagree): T {
  if (p.value !== null && a.value !== null && p.value !== a.value) {
    disagree(topic, [...p.quotes, ...a.quotes]);
    return { ...p, value: null, quotes: [] };
  }
  if (p.value !== null) return p;
  if (a.value !== null) return a;
  // Neither states it. Keep any supporting quotes (e.g. "doesn't say delivery is refunded").
  return { ...p, quotes: [...p.quotes, ...a.quotes] };
}

function mergeWindow(p: SourcedTerms, a: SourcedTerms, disagree: Disagree): SourcedTerms["window"] {
  const pw = p.window;
  const aw = a.window;
  let days = pw.days ?? aw.days;
  let usedAssistant = pw.days === null && aw.days !== null;
  if (pw.days !== null && aw.days !== null && pw.days !== aw.days) {
    disagree("how many days you have to return it", [...pw.quotes, ...aw.quotes]);
    days = null;
    usedAssistant = false;
  }

  let starts = pw.starts ?? aw.starts;
  if (pw.starts === null && aw.starts !== null) usedAssistant = true;
  if (pw.starts !== null && aw.starts !== null && pw.starts !== aw.starts) {
    // Carrier-confirmed delivery is a more precise way of saying delivery.
    const delivery = new Set(["delivery", "carrier_confirmed_delivery"]);
    if (delivery.has(pw.starts) && delivery.has(aw.starts)) {
      starts = "carrier_confirmed_delivery";
      if (pw.starts === "delivery") usedAssistant = true;
    } else {
      disagree("when the return window starts", [...pw.quotes, ...aw.quotes]);
      starts = null;
    }
  }

  const usedPolicy = pw.days !== null || pw.starts !== null;
  const quotes = [...(usedPolicy ? pw.quotes : []), ...(usedAssistant ? aw.quotes : [])];
  return { days, starts, quotes };
}

/** Whether two fees contradict each other. A fee "charged, amount unstated" fits any charged fee. */
export function feesDiffer(x: Fee, y: Fee): boolean {
  const unstated = (f: Fee) => f.type === "charged_amount_unstated";
  if (unstated(x) || unstated(y)) return x.type === "none" || y.type === "none";
  if (x.type !== y.type) return true;
  if (x.type === "percent") {
    if (x.percent !== y.percent) return true;
    return x.cap !== null && y.cap !== null && x.cap !== y.cap;
  }
  if (x.type === "flat") return x.amount !== y.amount;
  return false;
}

function mergeFees(p: SourcedTerms, a: SourcedTerms, disagree: Disagree): SourcedTerms["fees_by_condition"] {
  const pf = p.fees_by_condition;
  const af = a.fees_by_condition;
  if (pf.length === 0) return af;
  if (af.length === 0) return pf;

  const find = (list: typeof pf, c: Condition) => list.find((f) => f.condition === c) ?? list.find((f) => f.condition === "any");
  const conflicted = new Set<Condition>();

  for (const entry of pf) {
    const other = find(af, entry.condition);
    if (other && feesDiffer(entry.fee, other.fee)) {
      disagree(CONDITION_TOPIC[entry.condition], [...entry.quotes, ...other.quotes]);
      conflicted.add(entry.condition);
    }
  }
  // An assistant condition the policy covers only with an "any" fee.
  for (const entry of af) {
    if (pf.some((f) => f.condition === entry.condition)) continue;
    const other = find(pf, entry.condition);
    if (other && feesDiffer(entry.fee, other.fee)) {
      disagree(CONDITION_TOPIC[entry.condition], [...other.quotes, ...entry.quotes]);
      conflicted.add(other.condition);
    }
  }

  return pf
    .filter((entry) => !conflicted.has(entry.condition))
    .map((entry) => {
      // The policy says a fee is charged but not how much; the assistant names it.
      const other = find(af, entry.condition);
      return entry.fee.type === "charged_amount_unstated" && other && other.fee.type !== "charged_amount_unstated" ? other : entry;
    });
}

function mergeReturnShipping(p: SourcedTerms, a: SourcedTerms, disagree: Disagree): SourcedTerms["return_shipping"] {
  const pr = p.return_shipping;
  const ar = a.return_shipping;
  if (pr.type === "not_mentioned") return ar;
  if (ar.type === "not_mentioned") return pr;
  if (pr.type === ar.type) {
    if (pr.type === "flat" && pr.amount !== null && ar.amount !== null && pr.amount !== ar.amount) {
      disagree("what return shipping costs", [...pr.quotes, ...ar.quotes]);
      return { type: "not_mentioned", amount: null, quotes: [] };
    }
    return pr;
  }
  // "You pay it, amount unstated" fits a stated flat amount.
  const pair = new Set([pr.type, ar.type]);
  if (pair.has("customer_pays_unstated") && pair.has("flat")) return pr.type === "flat" ? pr : ar;
  disagree("who pays return shipping", [...pr.quotes, ...ar.quotes]);
  return { type: "not_mentioned", amount: null, quotes: [] };
}

function mergeExchange(p: SourcedTerms, a: SourcedTerms, disagree: Disagree): SourcedTerms["exchange"] {
  const pe = p.exchange;
  const ae = a.exchange;
  if (pe.free !== null && ae.free !== null && pe.free !== ae.free) {
    disagree("whether an exchange is free", [...pe.quotes, ...ae.quotes]);
    return emptyTerms<Quote>().exchange;
  }
  return pe.free !== null ? pe : ae;
}

export type { Terms };
