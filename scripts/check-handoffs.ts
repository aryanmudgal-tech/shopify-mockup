// Checks the demo cards' hand-off links against the stores, once.
//
//   npx tsx scripts/check-handoffs.ts
//
// Builds both demo cards from the recorded responses and saved reads, then
// requests each checkout link without following the redirect, and records
// where the store sends the buyer. This is what a buyer's click starts: the
// store opens a checkout, and nothing is bought. No personal data is sent.

import { writeFileSync } from "node:fs";
import { runCheck } from "../server/check";
import { ModelCache } from "../server/modelCache";
import { RECORDED_LINKS, RecordedTransport } from "../server/ucp/recorded";

const results: object[] = [];
for (const link of RECORDED_LINKS) {
  const card = await runCheck(new RecordedTransport(), link, "14228", { model: null, cache: new ModelCache("readonly") });
  const links = [
    { button: "Buy it", url: card.product.checkoutUrl },
    { button: "Order the sample", url: card.tryFirst.status === "sample" ? card.tryFirst.checkoutUrl : null },
  ].filter((l): l is { button: string; url: string } => l.url !== null);

  for (const { button, url } of links) {
    // Follow the store's redirects by hand, a few hops, recording each one.
    const hops: { status: number; at: string }[] = [];
    let at = url;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(at, { redirect: "manual", headers: { "User-Agent": "BeforeYouBuy/0.1 (prototype)" } });
      hops.push({ status: res.status, at: tidy(at) });
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) break;
      at = new URL(location, at).toString();
    }
    const result = { store: card.product.seller.name, button, hops, checked_at: new Date().toISOString() };
    results.push(result);
    console.log(`${result.store} | ${button}:\n  ${hops.map((h) => `${h.status} ${h.at}`).join("\n  ")}`);
  }
}

/** Host and path, with the store's checkout tokens masked: they're the store's, not ours to keep. */
function tidy(url: string): string {
  const u = new URL(url);
  return u.hostname + u.pathname.replace(/\/[A-Za-z0-9_-]{20,}/g, "/{token}");
}
writeFileSync(new URL("../fixtures/verification/handoffs.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
