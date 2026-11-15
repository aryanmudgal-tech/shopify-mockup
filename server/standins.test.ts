// Guardrail 1 from spec 8.2, applied early: every quote on the card must be an
// exact substring of the store's answer after whitespace normalisation.

import { describe, expect, it } from "vitest";
import { askReturns } from "./ask";
import { standInReturns } from "./standins";
import { RecordedTransport } from "./ucp/recorded";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe.each([
  ["burrow-prod.myshopify.com", "gid://shopify/ProductVariant/50484946305326", 6900],
  ["mygarvee.myshopify.com", "gid://shopify/ProductVariant/51296972898617", 0],
])("stand-in returns row for %s", (domain, variantId, delivery) => {
  it("quotes only words the store actually used", async () => {
    const answer = await askReturns(new RecordedTransport(), domain, variantId, "14228");
    expect(answer).not.toBeNull();
    const row = standInReturns(domain, answer!.answer, delivery, null);
    expect(row.status).toBe("terms");
    if (row.status !== "terms") return;

    const quotes = [...row.lines.flatMap((l) => l.quotes), row.window?.quote ?? ""].filter(Boolean);
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(squash(row.raw)).toContain(squash(q));
  });
});
