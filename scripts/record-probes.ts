// Records the cart-route probe for the two demo stores, for recorded mode.
//
//   npx tsx scripts/record-probes.ts
//
// The probe requests a cart page with a made-up token, so it creates nothing.

import { writeFileSync } from "node:fs";
import { cartProbeUrl } from "../server/handoff";
import { probeRedirects } from "../server/ucp/live";

for (const [dir, domain] of [
  ["burrow", "burrow-prod.myshopify.com"],
  ["garvee", "mygarvee.myshopify.com"],
] as const) {
  const url = cartProbeUrl(domain);
  const probe = await probeRedirects(url, fetch);
  const file = new URL(`../fixtures/verification/${dir}/10-cart-route-probe.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ fetched_at: new Date().toISOString(), url, probe }, null, 2) + "\n");
  console.log(dir, JSON.stringify(probe));
}
