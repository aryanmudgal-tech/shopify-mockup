// Global Catalog lookup and Storefront Catalog sample search (spec 7.2, 7.4).

import type { ProductHeader } from "../shared/card";
import type { ModelDeps } from "./extract";
import { matchSwatch, type SwatchMatch } from "./swatch";
import type { Transport } from "./ucp/transport";

export interface FoundProduct {
  header: ProductHeader;
  variantId: string;
  variantTitle: string;
  /** seller.domain: the store's UCP endpoint host (spec 7.2). */
  storeDomain: string;
  refundPolicyUrl: string | null;
  /** The option that names the fabric or colour; drives the sample search. */
  fabric: { name: string; label: string } | null;
  /** How the product was found, for "How I checked". */
  via: { kind: "lookup" } | { kind: "search"; query: string };
  /** The link named no variant (or one the Catalog didn't have), so the check picked one. */
  variantGuessed: boolean;
}

const FABRIC_OPTION = /fabric|colou?r|material|upholstery/i;

/** Lookup by link first; if Global Catalog doesn't know the link, search for the page's title (spec 7.2). */
export async function findProduct(t: Transport, link: string, zip: string): Promise<FoundProduct | null> {
  const context = { address_country: "US", postal_code: zip };
  const lookup = await t.call("global", "lookup_catalog", { catalog: { ids: [link], context } });
  const product = lookup.structuredContent?.products?.[0];
  const wanted = safeUrl(link)?.searchParams.get("variant") ?? null;
  if (product) return toFound(product, wanted, { kind: "lookup" });

  const query = await pageTitle(t, link);
  if (!query) return null;
  const search = await t.call("global", "search_catalog", { catalog: { query, context, pagination: { limit: 10 } } });
  const host = bareHost(link);
  // Only accept a listing from the store the buyer linked to.
  const match = (search.structuredContent?.products ?? []).find((p: any) =>
    (p.variants ?? []).some((v: any) => bareHost(v.seller?.url ?? "") === host),
  );
  if (!match) return null;
  return toFound(match, wanted, { kind: "search", query });
}

function toFound(product: any, wanted: string | null, via: FoundProduct["via"]): FoundProduct | null {
  // Prefer the variant named in the link; Global Catalog returns it first in practice.
  const variants: any[] = product.variants ?? [];
  const named = variants.find((v) => wanted && String(v.id).endsWith(`/${wanted}`));
  const variant = named ?? variants[0];
  if (!variant) return null;
  const variantGuessed = !named;

  const seller = variant.seller ?? product.seller ?? {};
  const options: { name: string; label: string }[] = (variant.options ?? []).map((o: any) => ({
    name: String(o.name),
    label: String(o.label),
  }));
  const image = (product.media ?? []).find((m: any) => /\.(jpe?g|png|webp|avif)(\?|$)/i.test(m.url ?? ""));
  const fabric = options.find((o) => FABRIC_OPTION.test(o.name)) ?? null;
  const shown = fabric ?? options[0];

  return {
    header: {
      title: product.title,
      imageUrl: image?.url ?? null,
      options,
      seller: { name: seller.name ?? "Unknown store", url: seller.url ?? null },
      rating: product.rating
        ? { value: product.rating.value, scaleMax: product.rating.scale_max, count: product.rating.count }
        : null,
      listedCents: variant.price.amount,
      checkoutUrl: variant.checkout_url ?? null,
      variantNote: variantGuessed ? guessedNote(shown, options.length > 0) : null,
    },
    variantId: variant.id,
    variantTitle: options.map((o) => o.label).join(" / ") || variant.title,
    storeDomain: seller.domain,
    refundPolicyUrl: (seller.links ?? []).find((l: any) => l.type === "refund_policy")?.url ?? null,
    fabric,
    via,
    variantGuessed,
  };
}

/** "Your link didn't name a fabric, so this shows Crushed Gravel - Performance Chenille." */
function guessedNote(option: { name: string; label: string } | undefined, hasOptions: boolean): string | null {
  if (!hasOptions || !option) return null;
  return `Your link didn't name a ${option.name.toLowerCase()}, so this shows ${option.label}.`;
}

/**
 * The product's name from its page: og:title, else <title> without the
 * " | Store" suffix. If the page can't be read, the link's handle stands in.
 */
async function pageTitle(t: Transport, link: string): Promise<string | null> {
  try {
    const { html } = await t.fetchPage(link);
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const title = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const clean = title?.split(/\s[|–—-]\s/)[0]?.replace(/&amp;/g, "&").trim();
    if (clean) return clean;
  } catch {
    // Fall through to the handle.
  }
  const handle = safeUrl(link)?.pathname.match(/\/products\/([^/]+)/)?.[1];
  return handle ? handle.replace(/-/g, " ") : null;
}

function bareHost(url: string): string {
  return safeUrl(url)?.hostname.replace(/^www\./, "") ?? "";
}

export interface SampleSearch {
  queries: { query: string; results: number }[];
  match: SwatchMatch | null;
  /** The model's one-line reason for its last decision. */
  reason: string | null;
  /** Set when the model named an ID that isn't in the results. */
  rejected: string | null;
  model: string | null;
  cached: boolean;
}

/** "Crushed Gravel - Performance Chenille" -> "Crushed Gravel"; "Corduroy | Grey" -> "Corduroy". */
export function fabricName(label: string): string {
  return label.split(/\s[-|/]\s|\|/)[0]!.trim();
}

export function sampleQueries(fabric: { label: string } | null): string[] {
  const queries = fabric ? [`${fabricName(fabric.label)} swatch`] : [];
  return [...queries, "swatch", "sample"];
}

export async function searchSample(
  t: Transport,
  storeDomain: string,
  fabric: { name: string; label: string } | null,
  deps: ModelDeps,
): Promise<SampleSearch> {
  const out: SampleSearch = { queries: [], match: null, reason: null, rejected: null, model: null, cached: true };
  for (const query of sampleQueries(fabric)) {
    const result = await t.call(storeDomain, "search_catalog", {
      catalog: { query, pagination: { limit: 20 } },
    });
    const products: any[] = result.structuredContent?.products ?? [];
    out.queries.push({ query, results: products.length });
    // Without a fabric option there is nothing to match a sample to.
    if (!fabric || products.length === 0) continue;
    const decision = await matchSwatch(deps, fabric, query, products);
    out.reason = decision.reason;
    out.model = decision.model;
    out.cached &&= decision.cached;
    if (decision.rejected) out.rejected = decision.rejected;
    if (decision.match) return { ...out, match: decision.match };
  }
  return out;
}

function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
