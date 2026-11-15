// Hand-offs (spec 6.4, 7.6). Both buttons open the store's own checkout
// through a checkout_url from Shopify's data: the piece's from Global Catalog,
// the sample's from the store's catalog. Before a link reaches the page, code
// checks it is what the card claims: https, on the store's own domain, and a
// checkout permalink for the same variant the card shows. The query string is
// left exactly as Shopify gave it, so the attribution parameters stay intact.

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
