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
      title: string;
      priceCents: number;
      imageUrl: string | null;
      /** The sofa option label the sample was matched on. */
      matchedOn: string;
      /** The swatch variant's own checkout link (spec 7.6). */
      checkoutUrl: string;
    }
  | { status: "none" };

// --- If you're wrong --------------------------------------------------------

export type ReturnsSource = "answer" | "policy_page";

export type Fee =
  | { type: "percent"; percent: number; capCents: number | null }
  | { type: "flat"; cents: number }
  | { type: "none" };

/**
 * One line of the "If you're wrong" row. Every line that rests on the store's
 * words carries its quotes, each an exact substring of `raw`. Lines next to
 * each other with the same quotes share them, and the page shows them once.
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
      quotes: string[];
    }
  | { kind: "fee_unstated"; quotes: string[] }
  | { kind: "return_shipping_unstated"; quotes: string[] }
  | { kind: "delivery_refund_unstated"; deliveryCents: number; quotes: string[] }
  | { kind: "exchange"; conditions: string; quotes: string[] };

export interface ReturnWindow {
  days: number | null;
  /** e.g. "confirmed delivery"; null when the store doesn't say. */
  starts: string | null;
  quote: string;
}

export type IfWrongRow =
  | {
      status: "terms";
      source: ReturnsSource;
      lines: ReturnLine[];
      window: ReturnWindow | null;
      policyUrl: string | null;
      /** The full text the quotes come from. */
      raw: string;
    }
  | { status: "no_returns"; source: ReturnsSource; quote: string; policyUrl: string | null; raw: string }
  | { status: "unreadable"; source: ReturnsSource; policyUrl: string | null; raw: string };

// --- How I checked ----------------------------------------------------------

export interface CheckStep {
  id: "identify" | "price" | "sample" | "returns";
  title: string;
  /** The UCP tool called, e.g. "lookup_catalog". */
  tool: string;
  /** Where it was called: "Global Catalog" or the store's domain. */
  endpoint: string;
  outcome: "ok" | "empty" | "failed";
  /** What came back, in one or two sentences. */
  summary: string;
  /** Optional longer text, such as the store's full answer. */
  detail?: string;
}
