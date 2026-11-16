import { describe, expect, it } from "vitest";
import { checkHandoff, classifyProbe, productPageLink } from "./handoff";

const BURROW_HOSTS = ["burrow-prod.myshopify.com", "burrow.com"];
const SOFA = "gid://shopify/ProductVariant/50484946305326";
const SWATCH = "gid://shopify/ProductVariant/50269421830446";
const BUY =
  "https://burrow-prod.myshopify.com/buy/50484946305326:1?ucp/version=2026-08-25&attribution/utm_source=shopify&attribution/utm_medium=catalog&channel=hydrogen&attribution/click_id_tag=_gsid&attribution/click_id_value=CtSW7Nc5s6QG&_gsid=CtSW7Nc5s6QG";

describe("checkHandoff", () => {
  it("accepts the Catalog's buy link as is, attribution parameters intact", () => {
    const c = checkHandoff(BUY, SOFA, BURROW_HOSTS);
    expect(c).toEqual({ ok: true, url: BUY, host: "burrow-prod.myshopify.com", path: "/buy/50484946305326:1", keepsAttribution: true });
  });

  it("accepts the swatch's cart permalink", () => {
    expect(checkHandoff("https://burrow-prod.myshopify.com/cart/50269421830446:1", SWATCH, BURROW_HOSTS)).toMatchObject({
      ok: true,
      path: "/cart/50269421830446:1",
      keepsAttribution: false,
    });
  });

  it("refuses links that aren't what the card claims", () => {
    const cases: [string | null, string][] = [
      [null, "no checkout link"],
      ["javascript:alert(1)", "isn't https"],
      [BUY.replace("https:", "http:"), "isn't https"],
      [BUY.replace("burrow-prod.myshopify.com", "burrow-prod.example.com"), "not the store"],
      ["https://burrow-prod.myshopify.com/products/nomad-plus-sofa", "isn't a checkout permalink"],
      [BUY.replace("50484946305326:1", "50484946305327:1"), "different variant"],
      [BUY.replace("50484946305326:1", "50484946305326:3"), "3 items"],
    ];
    for (const [url, why] of cases) {
      const c = checkHandoff(url, SOFA, BURROW_HOSTS);
      expect(c.ok, String(url)).toBe(false);
      if (!c.ok) expect(c.reason).toContain(why);
    }
  });
});

describe("classifyProbe", () => {
  const hops = (...h: [number, string][]) => h.map(([status, host]) => ({ status, host }));
  it("is shopify when Shopify serves the last page, even a 404 for the made-up token (Burrow)", () => {
    expect(classifyProbe({ hops: hops([301, "burrow-prod.myshopify.com"], [404, "checkout.burrow.com"]), servedByShopify: true }, "burrow-prod.myshopify.com")).toBe("shopify");
  });
  it("is off_shopify for a 404 on another site that Shopify didn't serve (Garvee)", () => {
    expect(classifyProbe({ hops: hops([301, "mygarvee.myshopify.com"], [404, "www.garvee.com"]), servedByShopify: false }, "mygarvee.myshopify.com")).toBe("off_shopify");
  });
  it("is inconclusive for anything less clear, so the checkout link stays", () => {
    expect(classifyProbe(null, "x.myshopify.com")).toBe("inconclusive");
    expect(classifyProbe({ hops: hops([301, "x.myshopify.com"], [200, "www.x.com"]), servedByShopify: false }, "x.myshopify.com")).toBe("inconclusive");
    expect(classifyProbe({ hops: hops([404, "x.myshopify.com"]), servedByShopify: false }, "x.myshopify.com")).toBe("inconclusive");
    expect(classifyProbe({ hops: hops([301, "x.myshopify.com"], [503, "www.x.com"]), servedByShopify: false }, "x.myshopify.com")).toBe("inconclusive");
  });
});

describe("productPageLink", () => {
  const GARVEE = "https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?_gsid=3R41HerWZSFK&utm_source=shopify&utm_medium=catalog";
  const hosts = ["mygarvee.myshopify.com", "www.garvee.com"];
  it("keeps the attribution and adds the variant on the card", () => {
    const link = productPageLink(GARVEE, "gid://shopify/ProductVariant/51296972898617", hosts)!;
    expect(link).toContain("utm_source=shopify&utm_medium=catalog");
    expect(new URL(link).searchParams.get("variant")).toBe("51296972898617");
  });
  it("refuses links off the store or off a product page", () => {
    expect(productPageLink(GARVEE.replace("www.garvee.com", "evil.example"), "gid://v/1", hosts)).toBeNull();
    expect(productPageLink("https://www.garvee.com/collections/sofas", "gid://v/1", hosts)).toBeNull();
    expect(productPageLink(null, "gid://v/1", hosts)).toBeNull();
  });
});
