import { describe, expect, it } from "vitest";
import { checkHandoff } from "./handoff";

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
