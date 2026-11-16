// Hand-offs (spec 6.4, 7.6). Both buttons open the store's own checkout
// through a checkout_url from Shopify's data: the piece's from Global Catalog,
// the sample's from the store's catalog. Before a link reaches the page, code
// checks it is what the card claims: https, on the store's own domain, and a
// checkout permalink for the same variant the card shows. The query string is
// left exactly as Shopify gave it, so the attribution parameters stay intact.

import type { Probe } from "./ucp/transport";

export type HandoffCheck =
  | { ok: true; url: string; host: string; path: string; keepsAttribution: boolean }
  | { ok: false; reason: string };

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function checkHandoff(raw: string | null, variantId: string, storeHosts: (string | null)[]): HandoffCheck {
  if (!raw) return { ok: false, reason: "Shopify gave no checkout link." };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "The checkout link isn't a valid address." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "The checkout link isn't https." };

  const host = u.hostname.replace(/^www\./, "");
  const hosts = storeHosts.filter((h): h is string => Boolean(h)).map((h) => h.replace(/^www\./, ""));
  if (!hosts.includes(host)) return { ok: false, reason: `The checkout link points at ${host}, not the store.` };

  // Shopify checkout permalinks: /buy/{variant}:{qty} (Catalog) or /cart/{variant}:{qty} (store).
  const m = u.pathname.match(/^\/(buy|cart)\/(\d+):(\d+)\/?$/);
  if (!m) return { ok: false, reason: "The checkout link isn't a checkout permalink." };
  if (m[2] !== numericId(variantId)) return { ok: false, reason: "The checkout link is for a different variant than the card shows." };
  if (m[3] !== "1") return { ok: false, reason: `The checkout link is for ${m[3]} items, not one.` };

  const keepsAttribution = [...u.searchParams.keys()].some((k) => k.startsWith("attribution/") || k.startsWith("utm_"));
  return { ok: true, url: raw, host, path: u.pathname, keepsAttribution };
}

// --- Stores whose cart pages leave Shopify ------------------------------------
//
// Some stores run their own storefront site and send every Shopify cart page
// to it, but that site doesn't serve them (Garvee, docs/verification.md 11.3).
// There, every checkout link dead-ends. A cart page with a made-up token
// creates nothing, so following its redirects is a harmless test: if the last
// page is a 404 that Shopify didn't serve, checkout links can't work.

export type CartRoute = "shopify" | "off_shopify" | "inconclusive";

export function cartProbeUrl(storeDomain: string): string {
  return `https://${storeDomain}/cart/c/before-you-buy-probe`;
}

export function classifyProbe(probe: Probe | null, storeDomain: string): CartRoute {
  const last = probe?.hops.at(-1);
  if (!probe || !last) return "inconclusive";
  if (probe.servedByShopify) return "shopify";
  // Only a clear "not found" on another site counts; anything else keeps the checkout link.
  if (last.status === 404 && last.host !== storeDomain) return "off_shopify";
  return "inconclusive";
}

/**
 * The product page to open instead: Global Catalog's link for the variant,
 * attribution kept, with ?variant= set so the page shows the variant on the card.
 */
export function productPageLink(raw: string | null, variantId: string, storeHosts: (string | null)[]): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const hosts = storeHosts.filter((h): h is string => Boolean(h)).map((h) => h.replace(/^www\./, ""));
  if (u.protocol !== "https:" || !hosts.includes(u.hostname.replace(/^www\./, "")) || !u.pathname.startsWith("/products/")) return null;
  if (!u.searchParams.has("variant")) u.searchParams.set("variant", numericId(variantId));
  return u.toString();
}
