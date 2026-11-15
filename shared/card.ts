// The card the page renders. The server builds it from Shopify responses;
// the page only formats it. All money is in cents (USD minor units), as the
// Catalog and Cart MCPs return it. Spec sections 6.3 and 8.3.

export type DataMode = "live" | "recorded" | "mock";

export interface CheckRequest {
  url: string;
  zip: string;
}

export type CheckErrorCode =
  | "bad_input"
  | "not_found"
  | "not_recorded"
  | "mode_unavailable"
  | "upstream"
  | "server";

export type CheckResponse =
  | { ok: true; card: Card }
  | { ok: false; error: { code: CheckErrorCode; message: string } };

export interface Card {
  mode: DataMode;
  /** When the recorded responses were fetched, for the footer label. */
  recordedAt: string | null;
  zip: string;
  product: ProductHeader;
  toBuy: ToBuyRow;
  tryFirst: TryFirstRow;
  ifWrong: IfWrongRow;
  steps: CheckStep[];
}

export interface ProductHeader {
  title: string;
  imageUrl: string | null;
  /** The chosen variant's options, e.g. Fabric: Crushed Gravel - Performance Chenille. */
  options: { name: string; label: string }[];
  seller: { name: string; url: string | null };
  rating: { value: number; scaleMax: number; count: number } | null;
  listedCents: number;
  /** Hand-off for "Buy it". Keeps the Catalog's attribution parameters. */
  checkoutUrl: string | null;
  /**
   * Set when the link named no variant and the check had to pick one, e.g.
   * "Your link didn't name a fabric, so this shows Crushed Gravel - Performance Chenille."
   */
  variantNote: string | null;
}

// --- To buy -----------------------------------------------------------------

export type ToBuyRow =
  | {
      status: "priced";
      listedCents: number;
      deliveryCents: number;
      /** The cart's own name for the delivery option, e.g. "Standard Shipping". */
      deliveryLabel: string;
      doorCents: number;
    }
  | { status: "mismatch"; catalogCents: number; cartCents: number; detail: string }
  | { status: "no_delivery_quote"; listedCents: number; subtotalCents: number }
  | { status: "unavailable"; reason: string };

// --- Try it first -----------------------------------------------------------

export type TryFirstRow =
  | {
      status: "sample";
      /** The swatch's own variant, checked to exist in the store's search results. */
      variantId: string;
      title: string;
      priceCents: number;
      imageUrl: string | null;
      /** The sofa option label the sample was matched on. */
      matchedOn: string;
      /** The swatch variant's own checkout link (spec 7.6). */
      checkoutUrl: string;
    }
  /** otherSamples: the store sells samples, just none of this exact fabric. */
  | { status: "none"; otherSamples: boolean }
  | { status: "unavailable"; reason: string };

// --- If you're wrong --------------------------------------------------------

/**
 * Where a quote comes from (spec revision 4, principle 4). "policy" is the
 * store's own refund policy text and may be styled as the store's words.
 * "assistant" is the AI-written answer from Shopify's Ask tool: it is labelled
 * "The store's assistant" and never styled as the store's words.
 */
export type QuoteSource = "policy" | "assistant";

export interface Quote {
  /** An exact substring of that source's text, after whitespace normalisation. */
  text: string;
  source: QuoteSource;
}

export type Fee =
  | { type: "percent"; percent: number; capCents: number | null }
  | { type: "flat"; cents: number }
  | { type: "none" };

/**
 * One line of the "If you're wrong" row, with the quotes it rests on. Lines
 * next to each other with the same quotes share them, and the page shows them once.
 */
export type ReturnLine =
  | {
      kind: "loss";
      /** "with the original box", "without the box", or null for one rule. */
      condition: string | null;
      lossCents: number;
      fee: Fee;
      includesReturnShipping: boolean;
      /** Delivery the store says it does not refund, already inside lossCents. */
      includesDeliveryCents: number;
      /** A flat return-shipping charge, already inside lossCents. */
      includesReturnShippingCents: number;
      quotes: Quote[];
    }
  | { kind: "fee_unstated"; quotes: Quote[] }
  | { kind: "return_shipping_unstated"; quotes: Quote[] }
  /** deliveryCents is null when the cart couldn't price delivery. */
  | { kind: "delivery_refund_unstated"; deliveryCents: number | null; quotes: Quote[] }
  /** count is how many free exchanges the store allows, null when it doesn't say. */
  | { kind: "exchange"; count: number | null; conditions: string; quotes: Quote[] }
  | { kind: "final_sale"; value: boolean; quotes: Quote[] }
  /** The policy and the assistant say different things: show both, pick neither. */
  | { kind: "disagreement"; topic: string; quotes: Quote[] }
  /** Other terms are known, but neither source says what a return costs. */
  | { kind: "cost_unstated"; quotes: Quote[] };

export interface ReturnWindow {
  days: number | null;
  /** e.g. "confirmed delivery"; null when the store doesn't say. */
  starts: string | null;
  quotes: Quote[];
}

export type PolicySource =
  | { status: "read"; url: string; text: string }
  | { status: "failed"; url: string | null; reason: string };

export type AssistantSource =
  | { status: "answered"; text: string }
  | { status: "failed"; reason: string }
  | { status: "not_offered" };

/** Both sources are read on every check (spec 7.5). */
export interface ReturnsSources {
  policy: PolicySource;
  assistant: AssistantSource;
}

export type IfWrongRow =
  | { status: "terms"; lines: ReturnLine[]; window: ReturnWindow | null; sources: ReturnsSources }
  | { status: "no_returns"; quote: Quote; sources: ReturnsSources }
  /**
   * Fail closed: a check found the figures don't account for the store's
   * words, so the row shows the store's quotes and no computed figure.
   */
  | {
      status: "unverified";
      reason: string;
      quotes: Quote[];
      /** Lines with no computed figure (exchange, final sale, disagreements). */
      lines: ReturnLine[];
      window: ReturnWindow | null;
      sources: ReturnsSources;
    }
  | { status: "unreadable"; reason: string; sources: ReturnsSources };

// --- How I checked ----------------------------------------------------------

export interface CheckStep {
  id: "identify" | "price" | "sample" | "policy" | "assistant" | "extract";
  title: string;
  /** The UCP tool called, e.g. "lookup_catalog"; null for a page read. */
  tool: string | null;
  /** Where: "Global Catalog", the store's domain, or the page's address. */
  endpoint: string;
  outcome: "ok" | "empty" | "failed";
  /** What came back, in one or two sentences. */
  summary: string;
  /** The full text read, styled by whose words it is. */
  detail?: { kind: QuoteSource; text: string };
}
