// The store's refund policy page, the primary source for every figure and
// quote in the "If you're wrong" row (spec 7.5, revision 4).

import type { PolicySource } from "../shared/card";
import type { Transport } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

export async function readRefundPolicy(t: Transport, url: string | null): Promise<PolicySource> {
  if (!url) return { status: "failed", url: null, reason: "The store lists no refund policy page." };
  try {
    const page = await t.fetchPage(url);
    const text = htmlToText(page.html);
    if (text.length < 200) return { status: "failed", url, reason: "The policy page had almost no text." };
    return { status: "read", url, text };
  } catch (err) {
    return { status: "failed", url, reason: err instanceof UcpError ? err.message : "The policy page couldn't be fetched." };
  }
}

const BLOCK_TAGS =
  "p|div|h[1-6]|li|ul|ol|tr|td|th|table|thead|tbody|tfoot|section|article|header|footer|blockquote|main|nav|dl|dt|dd|figure|figcaption|hr";

/**
 * Page text with one line per block, in reading order. Shopify policy pages are
 * plain HTML, so tags and entities are enough; no DOM is needed.
 */
export function htmlToText(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t \r\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}
