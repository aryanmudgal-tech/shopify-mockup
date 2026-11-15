// Runs one check: identify the product, then in parallel price it at the
// door, look for a sample, read the refund policy and ask the store's
// assistant. Each part fails on its own, so one slow or broken call shows as
// that row's state instead of losing the card. Builds the card and the
// "How I checked" steps (spec 6.3).

import type { AssistantSource, Card, CheckStep, IfWrongRow, PolicySource, ToBuyRow, TryFirstRow } from "../shared/card";
import { formatUsd } from "../shared/money";
import { askAssistant } from "./ask";
import { quoteDoorPrice, type CartQuote } from "./cart";
import { findProduct, searchSample, type FoundProduct, type SampleSearch } from "./catalog";
import { readRefundPolicy } from "./policy";
import { standInReturns } from "./standins";
import type { Transport } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

type Settled<T> = { ok: true; value: T } | { ok: false; reason: string };

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Unknown error." };
  }
}

export async function runCheck(t: Transport, link: string, zip: string): Promise<Card> {
  const found = await findProduct(t, link, zip);
  if (!found) {
    throw new UcpError(
      "not_found",
      "Shopify's catalog didn't recognise that link, and a search for the page's title found no match from that store.",
    );
  }

  const [cart, sample, policy, assistant] = await Promise.all([
    settle(quoteDoorPrice(t, found.storeDomain, found.variantId, zip)),
    settle(searchSample(t, found.storeDomain, found.fabric)),
    readRefundPolicy(t, found.refundPolicyUrl),
    askAssistant(t, found.storeDomain, found.variantId, zip),
  ]);

  const toBuy: ToBuyRow = cart.ok ? toBuyRow(found, cart.value) : { status: "unavailable", reason: cart.reason };
  const deliveryCents = toBuy.status === "priced" ? toBuy.deliveryCents : null;
  const ifWrong: IfWrongRow = standInReturns(found.storeDomain, { policy, assistant }, deliveryCents);

  return {
    mode: t.mode,
    recordedAt: t.recordedAt,
    zip,
    product: found.header,
    toBuy,
    tryFirst: sample.ok ? tryFirstRow(sample.value) : { status: "unavailable", reason: sample.reason },
    ifWrong,
    steps: [
      identifyStep(found),
      priceStep(found, cart, toBuy, zip),
      sampleStep(found, sample),
      policyStep(policy),
      assistantStep(found, assistant, zip),
    ],
  };
}

function toBuyRow(found: FoundProduct, q: CartQuote): ToBuyRow {
  const listed = found.header.listedCents;
  if (q.variantId !== found.variantId || q.linePriceCents !== listed) {
    return {
      status: "mismatch",
      catalogCents: listed,
      cartCents: q.linePriceCents ?? q.subtotalCents,
      detail:
        q.variantId !== found.variantId
          ? "The cart priced a different variant from the one in the link."
          : "The cart priced this variant differently from the Catalog.",
    };
  }
  if (q.deliveryCents === null) return { status: "no_delivery_quote", listedCents: listed, subtotalCents: q.subtotalCents };
  return {
    status: "priced",
    listedCents: listed,
    deliveryCents: q.deliveryCents,
    deliveryLabel: q.deliveryLabel ?? "Delivery",
    doorCents: q.totalCents,
  };
}

function tryFirstRow(s: SampleSearch): TryFirstRow {
  if (!s.match) return { status: "none" };
  const { title, priceCents, imageUrl, matchedOn, checkoutUrl } = s.match;
  return { status: "sample", title, priceCents, imageUrl, matchedOn, checkoutUrl };
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

function identifyStep(f: FoundProduct): CheckStep {
  const matched = `${f.header.title}, variant ${numericId(f.variantId)} (${f.variantTitle}), sold by ${f.header.seller.name} and listed at ${formatUsd(f.header.listedCents)}`;
  if (f.via.kind === "search") {
    return {
      id: "identify",
      title: "Product identified",
      tool: "search_catalog",
      endpoint: "Global Catalog",
      outcome: "ok",
      summary:
        `Looking up the link found nothing, so I searched the Catalog for the page's title, "${f.via.query}", and picked ${f.header.seller.name}'s listing: ${matched}.` +
        (f.via.variantGuessed ? " The link named no variant, so this is the one the Catalog shows first." : ""),
    };
  }
  return {
    id: "identify",
    title: "Product identified",
    tool: "lookup_catalog",
    endpoint: "Global Catalog",
    outcome: "ok",
    summary: `Matched the link to ${matched}.`,
  };
}

function priceStep(f: FoundProduct, cart: Settled<CartQuote>, row: ToBuyRow, zip: string): CheckStep {
  const base = { id: "price" as const, title: "Cart priced", tool: "create_cart", endpoint: f.storeDomain };
  if (!cart.ok) return { ...base, outcome: "failed", summary: cart.reason };
  const q = cart.value;
  const cancelled = q.cancelled ? " The cart was cancelled afterwards." : " The cart couldn't be cancelled; it expires on its own.";
  if (row.status === "mismatch") return { ...base, outcome: "failed", summary: `${row.detail}${cancelled}` };
  if (row.status !== "priced") {
    return {
      ...base,
      outcome: "empty",
      summary: `The cart for ZIP ${zip} came back at ${formatUsd(q.subtotalCents)} with no delivery line.${cancelled}`,
    };
  }
  return {
    ...base,
    outcome: "ok",
    summary:
      row.deliveryCents === 0
        ? `One sofa to ZIP ${zip}: ${formatUsd(q.subtotalCents)} with free delivery, "${row.deliveryLabel}", so ${formatUsd(row.doorCents)} before tax. Same variant and price as the Catalog.${cancelled}`
        : `One sofa to ZIP ${zip}: ${formatUsd(q.subtotalCents)} + ${formatUsd(row.deliveryCents)} ${row.deliveryLabel} = ${formatUsd(row.doorCents)} before tax. Same variant and price as the Catalog.${cancelled}`,
  };
}

function sampleStep(f: FoundProduct, s: Settled<SampleSearch>): CheckStep {
  const base = { id: "sample" as const, title: "Store catalog searched for a sample", tool: "search_catalog", endpoint: f.storeDomain };
  if (!s.ok) return { ...base, outcome: "failed", summary: s.reason };
  const searched = s.value.queries.map((q) => `"${q.query}" (${q.results} results)`).join(", then ");
  const match = s.value.match;
  if (match) {
    return { ...base, outcome: "ok", summary: `Searched ${searched}. ${match.title} matches the sofa's fabric, ${match.matchedOn}, at ${formatUsd(match.priceCents)}.` };
  }
  const what = f.fabric ? `a sample of ${f.fabric.label}` : "a sample";
  return { ...base, outcome: "empty", summary: `Searched ${searched}. None of the results is ${what}.` };
}

function policyStep(policy: PolicySource): CheckStep {
  const endpoint = policy.url ? shortUrl(policy.url) : "seller.links";
  const base = { id: "policy" as const, title: "Refund policy read", tool: null, endpoint };
  if (policy.status === "failed") return { ...base, outcome: "failed", summary: policy.reason };
  const words = policy.text.split(/\s+/).length;
  return {
    ...base,
    outcome: "ok",
    summary: `Read the store's refund policy page, ${words.toLocaleString("en-US")} words. Every figure in "If you're wrong" and every highlighted quote comes from it.`,
    detail: { kind: "policy", text: policy.text },
  };
}

function assistantStep(f: FoundProduct, assistant: AssistantSource, zip: string): CheckStep {
  const base = { id: "assistant" as const, title: "Store's assistant asked about returns", tool: "ask_business", endpoint: f.storeDomain };
  switch (assistant.status) {
    case "not_offered":
      return { ...base, outcome: "empty", summary: "This store doesn't offer ask_business, so the card uses the policy page alone." };
    case "failed":
      return { ...base, outcome: "failed", summary: assistant.reason };
    case "answered":
      return {
        ...base,
        outcome: "ok",
        summary: `Asked what a return after delivery to ${zip} would cost, including fees, return shipping, delivery refunds, the window, final sale and exchanges. Its answer is an AI-written summary, used only for what the policy can't settle for this item:`,
        detail: { kind: "assistant", text: assistant.text },
      };
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}
