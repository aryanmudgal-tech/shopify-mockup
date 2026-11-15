import type { Card as CardModel } from "../../shared/card";
import { Card } from "./Card";

// Mock data, for review only: every empty and partial state from spec 6.3 that
// neither recorded store produces. Open with ?states.

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
  },
  toBuy: { status: "priced", listedCents: 99900, deliveryCents: 14900, deliveryLabel: "White glove delivery", doorCents: 114800 },
  tryFirst: { status: "none" },
  ifWrong: { status: "unreadable", source: "answer", policyUrl: null, raw: "" },
  steps: [],
};

const POLICY = "Items may be returned within 14 days. A $199 return shipping fee applies. Delivery fees are non-refundable.";
const FINAL = "Custom upholstery orders are final sale and cannot be returned or exchanged.";

const STATES: { title: string; card: CardModel }[] = [
  {
    title: "Store answer unavailable, read from the policy page. Flat return shipping and delivery not refunded, so both go into the figure.",
    card: {
      ...BASE,
      ifWrong: {
        status: "terms",
        source: "policy_page",
        policyUrl: "#",
        raw: POLICY,
        lines: [
          {
            kind: "loss",
            condition: null,
            lossCents: 34800,
            fee: { type: "none" },
            includesReturnShipping: false,
            includesDeliveryCents: 14900,
            includesReturnShippingCents: 19900,
            quotes: ["A $199 return shipping fee applies.", "Delivery fees are non-refundable."],
          },
        ],
        window: { days: 14, starts: null, quote: "Items may be returned within 14 days." },
      },
    },
  },
  {
    title: "No returns on this item.",
    card: { ...BASE, ifWrong: { status: "no_returns", source: "answer", quote: FINAL, policyUrl: "#", raw: FINAL } },
  },
  {
    title: "The answer couldn't be read after a retry.",
    card: {
      ...BASE,
      ifWrong: { status: "unreadable", source: "answer", policyUrl: "#", raw: "Returns are handled case by case. Contact us." },
    },
  },
  {
    title: "The cart priced the variant differently from the Catalog.",
    card: {
      ...BASE,
      toBuy: {
        status: "mismatch",
        catalogCents: 99900,
        cartCents: 109900,
        detail: "The cart priced this variant differently from the Catalog.",
      },
    },
  },
  {
    title: "The cart quoted no delivery for this ZIP.",
    card: { ...BASE, toBuy: { status: "no_delivery_quote", listedCents: 99900, subtotalCents: 99900 } },
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
