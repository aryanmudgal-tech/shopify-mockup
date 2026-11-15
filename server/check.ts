// Runs one check: identify the product, price it at the door, look for a
// sample, ask about returns. Builds the card and the "How I checked" steps.

import type { Card, CheckStep, IfWrongRow, ToBuyRow, TryFirstRow } from "../shared/card";
import { formatUsd } from "../shared/money";
import { askReturns } from "./ask";
import { quoteDoorPrice, type CartQuote } from "./cart";
import { lookupProduct, searchSample, type FoundProduct, type SampleSearch } from "./catalog";
import { standInReturns } from "./standins";
import type { UcpTransport } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

export async function runCheck(t: UcpTransport, link: string, zip: string): Promise<Card> {
  const found = await lookupProduct(t, link, zip);
  if (!found) {
    throw new UcpError(
      "not_found",
      "Shopify's catalog didn't recognise that link. If it's a product page, try the link with its ?variant= part.",
    );
  }

  const [quote, sample, answer] = await Promise.all([
    quoteDoorPrice(t, found.storeDomain, found.variantId, zip),
    searchSample(t, found.storeDomain, found.fabric),
    askReturns(t, found.storeDomain, found.variantId, zip),
  ]);

  const toBuy = toBuyRow(found, quote);
  const deliveryCents = toBuy.status === "priced" ? toBuy.deliveryCents : 0;
  const ifWrong: IfWrongRow = answer
    ? standInReturns(found.storeDomain, answer.answer, deliveryCents, found.refundPolicyUrl)
    : { status: "unreadable", source: "answer", policyUrl: found.refundPolicyUrl, raw: "" };

  return {
    mode: t.mode,
    recordedAt: t.recordedAt,
    zip,
    product: found.header,
    toBuy,
    tryFirst: tryFirstRow(sample),
    ifWrong,
    steps: [
      identifyStep(found),
      priceStep(found, quote, toBuy, zip),
      sampleStep(found, sample),
      returnsStep(found, answer, zip),
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
  return {
    id: "identify",
    title: "Product identified",
    tool: "lookup_catalog",
    endpoint: "Global Catalog",
    outcome: "ok",
    summary: `Matched the link to ${f.header.title}, variant ${numericId(f.variantId)} (${f.variantTitle}), sold by ${f.header.seller.name} and listed at ${formatUsd(f.header.listedCents)}.`,
  };
}

function priceStep(f: FoundProduct, q: CartQuote, row: ToBuyRow, zip: string): CheckStep {
  const call = { tool: "create_cart", endpoint: f.storeDomain };
  const cancelled = q.cancelled ? " The cart was cancelled afterwards." : "";
  if (row.status === "mismatch") {
    return { id: "price", title: "Cart priced", ...call, outcome: "failed", summary: `${row.detail}${cancelled}` };
  }
  if (row.status !== "priced") {
    return {
      id: "price",
      title: "Cart priced",
      ...call,
      outcome: "empty",
      summary: `The cart for ZIP ${zip} came back at ${formatUsd(q.subtotalCents)} with no delivery line.${cancelled}`,
    };
  }
  return {
    id: "price",
    title: "Cart priced",
    ...call,
    outcome: "ok",
    summary: `One sofa to ZIP ${zip}: ${formatUsd(q.subtotalCents)} + ${formatUsd(row.deliveryCents)} ${row.deliveryLabel} = ${formatUsd(row.doorCents)} before tax. Same variant and price as the Catalog.${cancelled}`,
  };
}

function sampleStep(f: FoundProduct, s: SampleSearch): CheckStep {
  const searched = s.queries.map((q) => `"${q.query}" (${q.results} results)`).join(", then ");
  const base = { id: "sample" as const, title: "Store catalog searched for a sample", tool: "search_catalog", endpoint: f.storeDomain };
  if (s.match) {
    return { ...base, outcome: "ok", summary: `Searched ${searched}. ${s.match.title} matches the sofa's fabric, ${s.match.matchedOn}, at ${formatUsd(s.match.priceCents)}.` };
  }
  const what = f.fabric ? `a sample of ${f.fabric.label}` : "a sample";
  return { ...base, outcome: "empty", summary: `Searched ${searched}. None of the results is ${what}.` };
}

function returnsStep(f: FoundProduct, answer: { answer: string } | null, zip: string): CheckStep {
  const base = { id: "returns" as const, title: "Store asked about returns", tool: "ask_business", endpoint: f.storeDomain };
  if (!answer) return { ...base, outcome: "failed", summary: "The store didn't answer the returns question." };
  return {
    ...base,
    outcome: "ok",
    summary: `Asked what a return after delivery to ${zip} would cost, including fees, return shipping, delivery refunds, the window, final sale and exchanges. The store answered:`,
    detail: answer.answer,
  };
}
