// Offline images for the recorded demo (spec 9: recorded mode is the default
// for the video "so a network failure cannot break the take"). If a resized
// copy of a card image is saved in fixtures/media/ (scripts/cache-images.ts),
// recorded mode serves it from /media/ instead of Shopify's CDN. Without a
// saved copy, the CDN link stays.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Card } from "../shared/card";

export const MEDIA_DIR = fileURLToPath(new URL("../fixtures/media/", import.meta.url));

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** "SAMP-UPH-CG-FAB-CHNIL" for ".../files/SAMP-UPH-CG-FAB-CHNIL.webp?v=1749237447". */
export function mediaStem(url: string): string {
  const name = new URL(url).pathname.split("/").pop() ?? "";
  return name.replace(/\.[a-z0-9]+$/i, "");
}

export function safeMediaName(name: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(name) && !name.startsWith(".") && extname(name).toLowerCase() in TYPES;
}

export function localImage(url: string | null, dir = MEDIA_DIR): string | null {
  if (!url || !existsSync(dir)) return url;
  let stem: string;
  try {
    stem = mediaStem(url);
  } catch {
    return url;
  }
  const saved = readdirSync(dir).find((f) => f.startsWith(`${stem}.`) && safeMediaName(f));
  return saved ? `/media/${saved}` : url;
}

export function localizeImages(card: Card, dir = MEDIA_DIR): Card {
  const tryFirst = card.tryFirst.status === "sample" ? { ...card.tryFirst, imageUrl: localImage(card.tryFirst.imageUrl, dir) } : card.tryFirst;
  return { ...card, product: { ...card.product, imageUrl: localImage(card.product.imageUrl, dir) }, tryFirst };
}

/** Serves GET /media/<name> from fixtures/media/. Returns false if the request isn't for /media/. */
export function serveMedia(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "GET" || !req.url?.startsWith("/media/")) return false;
  const name = decodeURIComponent(req.url.slice("/media/".length).split("?")[0] ?? "");
  const file = join(MEDIA_DIR, name);
  if (!safeMediaName(name) || !existsSync(file)) {
    res.writeHead(404).end();
    return true;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(name).toLowerCase()]!, "Cache-Control": "public, max-age=3600" });
  res.end(readFileSync(file));
  return true;
}
