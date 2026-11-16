// Saves resized copies of the demo cards' images into fixtures/media/, so the
// recorded demo shows them with no network.
//
//   npx tsx scripts/cache-images.ts
//
// Three files from Shopify's CDN at 480px wide, about 110 KB in all on
// 2026-11-15: the Nomad Sofa photo, the Crushed Gravel Chenille swatch and the
// Garvee sectional photo.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../server/check";
import { MEDIA_DIR, mediaStem } from "../server/media";
import { ModelCache } from "../server/modelCache";
import { RECORDED_LINKS, RecordedTransport } from "../server/ucp/recorded";

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

mkdirSync(MEDIA_DIR, { recursive: true });
for (const link of RECORDED_LINKS) {
  const card = await runCheck(new RecordedTransport(), link, "14228", { model: null, cache: new ModelCache("readonly") });
  const urls = [card.product.imageUrl, card.tryFirst.status === "sample" ? card.tryFirst.imageUrl : null].filter((u): u is string => Boolean(u));
  for (const raw of urls) {
    const u = new URL(raw);
    if (u.hostname !== "cdn.shopify.com") continue;
    u.searchParams.set("width", "480");
    const res = await fetch(u);
    const ext = EXT[res.headers.get("content-type") ?? ""];
    if (!res.ok || !ext) {
      console.log(`skipped ${u.pathname}: HTTP ${res.status} ${res.headers.get("content-type")}`);
      continue;
    }
    const file = join(MEDIA_DIR, `${mediaStem(raw)}${ext}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${file}`);
  }
}
