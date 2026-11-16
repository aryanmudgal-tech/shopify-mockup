// Runs one check: identify the product, then in parallel price it at the
// door, look for a sample, read the refund policy and ask the store's
// assistant. The model reads the policy and the answer into terms; code
// reconciles them and does the arithmetic. Each part fails on its own, so one
// slow or broken call shows as that row's state instead of losing the card.
// Builds the card and the "How I checked" steps (spec 6.3).

import type { AssistantSource, Card, CheckStep, Handoff, IfWrongRow, PolicySource, ToBuyRow, TryFirstRow } from "../shared/card";
import { formatUsd } from "../shared/money";
import { askAssistant } from "./ask";
import { quoteDoorPrice, type CartQuote } from "./cart";
import { findProduct, searchSample, type FoundProduct, type SampleSearch } from "./catalog";
import { returnsRow } from "./cost";
import { extractReturns, type Extraction, type ModelDeps } from "./extract";
import { cartProbeUrl, checkHandoff, classifyProbe, hostOf, productPageLink, type CartRoute, type HandoffCheck } from "./handoff";
import { modelFromEnv } from "./model";
import { cacheFromEnv } from "./modelCache";
import { readRefundPolicy } from "./policy";
import { reconcile, type Reconciled } from "./reconcile";
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

export function defaultDeps(): ModelDeps {
  return { model: modelFromEnv(), cache: cacheFromEnv() };
}

export async function runCheck(t: Transport, link: string, zip: string, deps: ModelDeps = defaultDeps()): Promise<Card> {
  const found = await findProduct(t, link, zip);
  if (!found) {
    throw new UcpError(
      "not_found",
      "Shopify's catalog didn't recognise that link, and a search for the page's title found no match from that store.",
    );
  }

  const [cart, sample, policy, assistant, probe] = await Promise.all([
    settle(quoteDoorPrice(t, found.storeDomain, found.variantId, zip)),
    settle(searchSample(t, found.storeDomain, found.fabric, deps)),
    readRefundPolicy(t, found.refundPolicyUrl),
    askAssistant(t, found.storeDomain, found.variantId, zip),
    settle(t.probe(cartProbeUrl(found.storeDomain))),
  ]);

  const toBuy: ToBuyRow = cart.ok ? toBuyRow(found, cart.value) : { status: "unavailable", reason: cart.reason };
  const deliveryCents = toBuy.status === "priced" ? toBuy.deliveryCents : null;

  const sources = { policy, assistant };
  const item = { title: found.header.title, options: found.header.options, seller: found.header.seller.name, variantId: found.variantId };
  const extraction = await extractReturns(deps, item, sources, zip);
  const reconciled = reconcile(extraction.policy?.terms ?? null, extraction.assistant?.terms ?? null);
  const ifWrong: IfWrongRow = returnsFrom(extraction, reconciled, { itemCents: found.header.listedCents, deliveryCents }, sources);

  // Hand-offs: a link only reaches the page if it is the store's checkout for the variant shown.
  const hosts = [found.storeDomain, hostOf(found.header.seller.url)];
  const buy = checkHandoff(found.header.checkoutUrl, found.variantId, hosts);
  let tryFirst: TryFirstRow = sample.ok ? tryFirstRow(sample.value) : { status: "unavailable", reason: sample.reason };
  const sampleLink = tryFirst.status === "sample" ? checkHandoff(tryFirst.checkoutUrl, tryFirst.variantId, hosts) : null;
  if (tryFirst.status === "sample" && sampleLink && !sampleLink.ok) tryFirst = { ...tryFirst, checkoutUrl: null };

  // A store whose cart pages leave Shopify can't open checkout links: the
  // buttons open product pages there instead. An inconclusive probe changes nothing.
  const route = classifyProbe(probe.ok ? probe.value : null, found.storeDomain);
  const seller = found.header.seller.name;
  const reason = `${seller}'s checkout links don't open from outside its own site.`;
  const swatchPage = sample.ok && sample.value.match ? productPageLink(sample.value.match.productUrl, sample.value.match.variantId, hosts) : null;
  const handoffs = {
    buy: chooseHandoff(buy, route, productPageLink(found.productPageUrl, found.variantId, hosts), reason),
    sample: sampleLink ? chooseHandoff(sampleLink, route, swatchPage, reason) : null,
  };

  return {
    mode: t.mode,
    recordedAt: t.recordedAt,
    zip,
    product: { ...found.header, checkoutUrl: buy.ok ? buy.url : null },
    toBuy,
    tryFirst,
    ifWrong,
    handoffs,
    steps: [
      identifyStep(found),
      priceStep(found, cart, toBuy, zip),
      sampleStep(found, sample),
      policyStep(policy),
      assistantStep(found, assistant, zip),
      extractStep(extraction, reconciled),
      handoffStep(seller, buy, sampleLink, handoffs, route, probe.ok ? null : probe.reason),
    ],
  };
}

function chooseHandoff(check: HandoffCheck, route: CartRoute, page: string | null, reason: string): Handoff | null {
  if (route === "off_shopify" && page) return { kind: "product_page", url: page, reason };
  return check.ok ? { kind: "checkout", url: check.url } : null;
}

function handoffStep(
  seller: string,
  buy: HandoffCheck,
  sample: HandoffCheck | null,
  handoffs: Card["handoffs"],
  route: CartRoute,
  probeError: string | null,
): CheckStep {
  const describe = (label: string, c: HandoffCheck, h: Handoff | null, viewLabel: string) => {
    if (h?.kind === "product_page") {
      const page = new URL(h.url);
      return `"${viewLabel}" opens ${page.hostname}${page.pathname} instead of checkout.`;
    }
    return c.ok
      ? `"${label}" opens ${c.host}${c.path}${c.keepsAttribution ? " with Shopify's attribution parameters kept as given" : ""}.`
      : `"${label}" is hidden: ${c.reason}`;
  };
  const probeLine =
    route === "shopify"
      ? "A test cart page with a made-up token ended on a page Shopify serves, so the store's checkout links should open."
      : route === "off_shopify"
        ? `A test cart page with a made-up token ended at a 404 on ${seller}'s own site that Shopify didn't serve, so its checkout links dead-end.`
        : `The test of the store's cart pages was inconclusive${probeError ? ` (${probeError})` : ""}, so the checkout links stay.`;
  const parts = [
    probeLine,
    describe("Buy it", buy, handoffs.buy, `View on ${seller}'s site`),
    sample ? describe("Order the sample", sample, handoffs.sample, `View the sample on ${seller}'s site`) : "There is no sample, so only one button shows.",
  ];
  const failed = !buy.ok || (sample !== null && !sample.ok);
  return {
    id: "handoff",
    title: "Checkout links checked",
    tool: null,
    endpoint: "checkout_url from Shopify",
    outcome: failed ? "failed" : "ok",
    summary: `${parts.join(" ")} Nothing is charged here; the buyer pays at the store.`,
  };
}

function returnsFrom(
  extraction: Extraction,
  reconciled: Reconciled,
  prices: { itemCents: number; deliveryCents: number | null },
  sources: { policy: PolicySource; assistant: AssistantSource },
): IfWrongRow {
  if (sources.policy.status !== "read" && sources.assistant.status !== "answered") {
    return { status: "unreadable", reason: "Neither the policy page nor the store's assistant could be read.", sources };
  }
  const reads = [extraction.policy, extraction.assistant].filter((x) => x !== null);
  if (reads.every((x) => x.terms === null)) {
    return { status: "unreadable", reason: reads[0]?.error ?? "The model couldn't read the terms.", sources };
  }
  return returnsRow(reconciled.terms, reconciled.disagreements, prices, sources);
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
  if (!s.match) return { status: "none", otherSamples: s.otherSamples };
  const { variantId, title, priceCents, imageUrl, matchedOn, checkoutUrl } = s.match;
  return { status: "sample", variantId, title, priceCents, imageUrl, matchedOn, checkoutUrl };
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

function identifyStep(f: FoundProduct): CheckStep {
  const matched = `${f.header.title}, variant ${numericId(f.variantId)} (${f.variantTitle}), sold by ${f.header.seller.name} and listed at ${formatUsd(f.header.listedCents)}`;
  const guessed = f.variantGuessed ? " The link named no variant, so this is the one the Catalog shows first." : "";
  if (f.via.kind === "search") {
    return {
      id: "identify",
      title: "Product identified",
      tool: "search_catalog",
      endpoint: "Global Catalog",
      outcome: "ok",
      summary:
        `Looking up the link found nothing, so I searched the Catalog for the page's title, "${f.via.query}", and picked ${f.header.seller.name}'s listing: ${matched}.${guessed}`,
    };
  }
  return {
    id: "identify",
    title: "Product identified",
    tool: "lookup_catalog",
    endpoint: "Global Catalog",
    outcome: "ok",
    summary: `Matched the link to ${matched}.${guessed}`,
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
  const { queries, match, reason, rejected, model, cached } = s.value;
  const searched = queries.map((q) => `"${q.query}" (${q.results} results)`).join(", then ");
  const by = model ? ` ${model} compared the results with the sofa's fabric${cached ? " (a saved read of the same results)" : ""}: ${reason}` : "";
  const check = rejected ? ` ${rejected} So it was not used.` : match ? " Its ID is in the search results." : "";
  if (match) {
    return { ...base, outcome: "ok", summary: `Searched ${searched}.${by}${check} ${match.title}, ${formatUsd(match.priceCents)}.` };
  }
  const what = f.fabric ? `a sample of ${f.fabric.label}` : "a sample";
  return { ...base, outcome: "empty", summary: `Searched ${searched}.${by}${check} None of the results is ${what}.` };
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

function extractStep(x: Extraction, r: Reconciled): CheckStep {
  const base = { id: "extract" as const, title: "Terms read and compared", tool: x.model, endpoint: x.cached ? "a saved read of the same texts" : "Anthropic API" };
  const reads = [x.policy, x.assistant].filter((e) => e !== null);
  if (reads.length === 0) return { ...base, outcome: "empty", summary: "There was no policy text or assistant answer to read." };
  const failed = reads.filter((e) => e.terms === null);
  if (failed.length === reads.length) return { ...base, outcome: "failed", summary: failed[0]!.error ?? "The model couldn't read the terms." };

  const parts = reads.map((e) => {
    const who = e.source === "policy" ? "the policy" : "the assistant's answer";
    if (!e.terms) return `It couldn't read ${who}: ${e.error}`;
    const n = countStated(e.terms);
    const retried = e.attempts > 1 ? `, after one retry` : "";
    const dropped = e.dropped.length ? `, and dropped ${e.dropped.length} value${e.dropped.length > 1 ? "s" : ""} whose quotes didn't check out` : "";
    return `${n} term${n === 1 ? "" : "s"} from ${who}${retried}${dropped}`;
  });
  const compared =
    r.disagreements.length === 0
      ? "Compared field by field, the two sources don't contradict each other."
      : `Compared field by field, they disagree on ${r.disagreements.map((d) => d.topic).join(" and ")}, so the card shows both and picks neither.`;
  return {
    ...base,
    outcome: "ok",
    summary: `The model read ${parts.join("; ")}. Every quote was checked word for word against its source, and every number against its quote; code did the arithmetic. ${compared}`,
  };
}

function countStated(t: NonNullable<Extraction["policy"]>["terms"] & object): number {
  return (
    (t.window.days !== null || t.window.starts !== null ? 1 : 0) +
    t.fees_by_condition.length +
    (t.return_shipping.type !== "not_mentioned" ? 1 : 0) +
    (t.original_delivery_refunded.value !== null ? 1 : 0) +
    (t.exchange.free !== null ? 1 : 0) +
    (t.final_sale.value !== null ? 1 : 0)
  );
}
