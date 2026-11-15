import type { Card as CardModel, Quote, ReturnsSources } from "../../shared/card";
import { Card } from "./Card";

// Mock data, for review only: every empty and partial state from spec 6.3 that
// neither recorded store produces. Open with ?states.

const P = (text: string): Quote => ({ text, source: "policy" });
const A = (text: string): Quote => ({ text, source: "assistant" });

const POLICY_TEXT =
  "Items may be returned within 14 days. A $199 return shipping fee applies. Delivery fees are non-refundable. Custom upholstery orders are final sale.";
const ASSISTANT_TEXT =
  "For this sofa, returns are accepted within 30 days and a 15% restocking fee applies. Return shipping is free.";

const BOTH: ReturnsSources = {
  policy: { status: "read", url: "#", text: POLICY_TEXT },
  assistant: { status: "answered", text: ASSISTANT_TEXT },
};

const BASE: CardModel = {
  mode: "mock",
  recordedAt: null,
  zip: "14228",
  product: {
    title: "Example Sofa",
    imageUrl: null,
    options: [{ name: "Fabric", label: "Oat - Boucle" }],
    seller: { name: "Example Store", url: null },
    rating: { value: 4.2, scaleMax: 5, count: 41 },
    listedCents: 99900,
    checkoutUrl: "#",
    variantNote: null,
  },
  toBuy: { status: "priced", listedCents: 99900, deliveryCents: 14900, deliveryLabel: "White glove delivery", doorCents: 114800 },
  tryFirst: { status: "none" },
  ifWrong: { status: "unreadable", reason: "", sources: BOTH },
  steps: [],
};

const STATES: { title: string; card: CardModel }[] = [
  {
    title: "The store's assistant is unavailable, so the policy page alone. Flat return shipping and delivery the store keeps both go into the figure.",
    card: {
      ...BASE,
      ifWrong: {
        status: "terms",
        sources: { ...BOTH, assistant: { status: "failed", reason: "ask_business timed out." } },
        lines: [
          {
            kind: "loss",
            condition: null,
            lossCents: 34800,
            fee: { type: "none" },
            includesReturnShipping: false,
            includesDeliveryCents: 14900,
            includesReturnShippingCents: 19900,
            quotes: [P("A $199 return shipping fee applies."), P("Delivery fees are non-refundable.")],
          },
        ],
        window: { days: 14, starts: null, quotes: [P("Items may be returned within 14 days.")] },
      },
    },
  },
  {
    title: "The policy page can't be read, so the store's assistant alone, labelled as such.",
    card: {
      ...BASE,
      ifWrong: {
        status: "terms",
        sources: { ...BOTH, policy: { status: "failed", url: "#", reason: "HTTP 503" } },
        lines: [
          {
            kind: "loss",
            condition: null,
            lossCents: 14985,
            fee: { type: "percent", percent: 15, capCents: null },
            includesReturnShipping: false,
            includesDeliveryCents: 0,
            includesReturnShippingCents: 0,
            quotes: [A("a 15% restocking fee applies"), A("Return shipping is free.")],
          },
          { kind: "delivery_refund_unstated", deliveryCents: 14900, quotes: [] },
        ],
        window: { days: 30, starts: null, quotes: [A("returns are accepted within 30 days")] },
      },
    },
  },
  {
    title: "The policy and the store's assistant disagree. Both are shown; the card picks neither.",
    card: {
      ...BASE,
      ifWrong: {
        status: "terms",
        sources: BOTH,
        lines: [
          { kind: "disagreement", topic: "the return window", quotes: [P("Items may be returned within 14 days."), A("returns are accepted within 30 days")] },
          { kind: "disagreement", topic: "return shipping", quotes: [P("A $199 return shipping fee applies."), A("Return shipping is free.")] },
        ],
        window: null,
      },
    },
  },
  {
    title: "No returns on this item.",
    card: { ...BASE, ifWrong: { status: "no_returns", quote: P("Custom upholstery orders are final sale."), sources: BOTH } },
  },
  {
    title: "Neither source could be read.",
    card: {
      ...BASE,
      ifWrong: {
        status: "unreadable",
        reason: "Neither the policy page nor the store's assistant could be read.",
        sources: { policy: { status: "failed", url: null, reason: "No link" }, assistant: { status: "not_offered" } },
      },
    },
  },
  {
    title: "The cart priced the variant differently from the Catalog.",
    card: {
      ...BASE,
      toBuy: { status: "mismatch", catalogCents: 99900, cartCents: 109900, detail: "The cart priced this variant differently from the Catalog." },
    },
  },
  {
    title: "The cart quoted no delivery for this ZIP.",
    card: { ...BASE, toBuy: { status: "no_delivery_quote", listedCents: 99900, subtotalCents: 99900 } },
  },
  {
    title: "The cart and the sample search both failed.",
    card: {
      ...BASE,
      toBuy: { status: "unavailable", reason: "create_cart at example.myshopify.com didn't respond (timed out)." },
      tryFirst: { status: "unavailable", reason: "search_catalog at example.myshopify.com didn't respond (timed out)." },
    },
  },
];

export function StatesPreview() {
  return (
    <div className="page">
      <main className="thread">
        <p className="msg msg-assistant">
          Empty and partial states, on mock data. The two demo links cover the rest. <a href="/">Back to the thread</a>
        </p>
        {STATES.map((s) => (
          <section key={s.title} className="state">
            <h2 className="state-title">{s.title}</h2>
            <Card card={s.card} />
          </section>
        ))}
      </main>
    </div>
  );
}
