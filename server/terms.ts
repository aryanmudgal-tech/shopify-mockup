// The return-terms contract (spec 8.3) the model fills in with a forced,
// strict tool call. The model reads ONE source at a time (the policy page, or
// the assistant's answer), so code can compare the two field by field.
//
// Differences from the spec's sketch, all so that code (not the model) decides
// what the card says:
// - Every field carries a list of quotes, because one value can rest on two
//   sentences (Burrow's 20% fee and its $250 cap).
// - Conditions, window start and exchange terms are enums and booleans, not
//   free text, so two sources can be compared and the card's wording is fixed.
// - The model returns quote strings; code attaches the source.

import type { Quote } from "../shared/card";

export type Condition = "with_original_packaging" | "without_original_packaging" | "any";
export type WindowStart = "carrier_confirmed_delivery" | "delivery" | "purchase" | "shipment";
export type FeeType = "percent" | "flat" | "none" | "charged_amount_unstated";
export type ReturnShippingType = "free" | "flat" | "included_in_fee" | "customer_pays_unstated" | "not_mentioned";

export interface Fee {
  type: FeeType;
  /** For "percent": the stated percentage, e.g. 10. */
  percent: number | null;
  /** For "flat": the stated dollar amount, e.g. 49. */
  amount: number | null;
  /** A stated dollar cap on the fee, e.g. 250. */
  cap: number | null;
}

export interface Terms<Q> {
  window: { days: number | null; starts: WindowStart | null; quotes: Q[] };
  fees_by_condition: { condition: Condition; fee: Fee; quotes: Q[] }[];
  return_shipping: { type: ReturnShippingType; amount: number | null; quotes: Q[] };
  original_delivery_refunded: { value: boolean | null; quotes: Q[] };
  exchange: {
    free: boolean | null;
    count: number | null;
    needs_original_packaging: boolean | null;
    within_return_window: boolean | null;
    quotes: Q[];
  };
  final_sale: { value: boolean | null; quotes: Q[] };
}

/** What the model returns for one source. */
export type ExtractedTerms = Terms<string>;
/** After the quote check, with each quote's source attached. */
export type SourcedTerms = Terms<Quote>;

export function emptyTerms<Q>(): Terms<Q> {
  return {
    window: { days: null, starts: null, quotes: [] },
    fees_by_condition: [],
    return_shipping: { type: "not_mentioned", amount: null, quotes: [] },
    original_delivery_refunded: { value: null, quotes: [] },
    exchange: { free: null, count: null, needs_original_packaging: null, within_return_window: null, quotes: [] },
    final_sale: { value: null, quotes: [] },
  };
}

// --- JSON schema for the strict tool ----------------------------------------
// Strict tool use needs additionalProperties: false and every property listed
// in required; a nullable field is an anyOf with null.

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const quotes = {
  type: "array",
  items: { type: "string" },
  description:
    "Exact passages copied character for character from the text, each one contiguous. Empty when the field is null or not mentioned.",
};
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TERMS_TOOL_NAME = "record_return_terms";

export const TERMS_SCHEMA = object({
  analysis: {
    type: "string",
    description:
      "Fill this first, in a few sentences: which passages state the return fee, return shipping, the window and when it starts, delivery refunds, exchanges and final sale for a change-of-mind return of this item, and which passages you are setting aside because they apply to other situations. Not shown to the buyer.",
  },
  window: object({
    days: nullable({ type: "integer", description: "Days the buyer has to start a return." }),
    starts: nullable({
      type: "string",
      enum: ["carrier_confirmed_delivery", "delivery", "purchase", "shipment"],
      description:
        "When the window starts. carrier_confirmed_delivery when it starts at delivery as confirmed by the carrier (carrier or tracking confirmation), even if the text calls that moment receipt; delivery when it starts at delivery or receipt with no mention of carrier confirmation; purchase or shipment when stated; null when not stated.",
    }),
    quotes,
  }),
  fees_by_condition: {
    type: "array",
    description:
      "Return charges other than one flat return shipping amount: restocking, re-packaging or return fees. A return shipping charge that is a percentage of the price or depends on packaging also goes here, with return_shipping set to included_in_fee. One entry per condition: with_original_packaging and without_original_packaging when a charge depends on packaging (when a charge applies only without the original packaging, record with_original_packaging with type none), otherwise one entry with condition any. Empty when the text mentions no such charge.",
    items: object({
      condition: { type: "string", enum: ["with_original_packaging", "without_original_packaging", "any"] },
      fee: object({
        type: {
          type: "string",
          enum: ["percent", "flat", "none", "charged_amount_unstated"],
          description:
            "charged_amount_unstated when the text says the buyer pays a return or restocking fee but gives no amount or rate. none only when the text says change-of-mind returns carry no fee or get a full refund, or (for with_original_packaging) when the charge applies only without the packaging.",
        },
        percent: nullable({ type: "number", description: "The stated percentage, for type percent." }),
        amount: nullable({ type: "number", description: "The stated dollar amount, for type flat, as a plain number." }),
        cap: nullable({ type: "number", description: "A stated dollar cap that applies to this fee, as a plain number." }),
      }),
      quotes,
    }),
  },
  return_shipping: object({
    type: {
      type: "string",
      enum: ["free", "flat", "included_in_fee", "customer_pays_unstated", "not_mentioned"],
      description:
        "flat with amount when the text states one fixed return shipping charge for every return (record it here, not in fees_by_condition); included_in_fee when the return fee is itself described as the return shipping charge and is a percentage or depends on packaging, even if the text doesn't say who pays the carrier; customer_pays_unstated when the buyer pays return shipping and no amount is stated; free only when the text says the store pays return shipping or returns are free (the store sending or providing a return label is not enough); not_mentioned otherwise.",
    },
    amount: nullable({ type: "number", description: "The stated dollar amount, for type flat." }),
    quotes,
  }),
  original_delivery_refunded: object({
    value: nullable({
      type: "boolean",
      description: "Whether the original delivery charge is refunded on a return. null unless the text says.",
    }),
    quotes,
  }),
  exchange: object({
    free: nullable({
      type: "boolean",
      description: "true only if the text says an exchange costs nothing; false if exchanges carry the usual return costs; null if not addressed.",
    }),
    count: nullable({ type: "integer", description: "How many free exchanges, if stated." }),
    needs_original_packaging: nullable({ type: "boolean" }),
    within_return_window: nullable({ type: "boolean", description: "true if the exchange must happen within the return window." }),
    quotes,
  }),
  final_sale: object({
    value: nullable({
      type: "boolean",
      description: "true only if the text says this item cannot be returned; false if it says the item is not final sale; null otherwise.",
    }),
    quotes,
  }),
});
