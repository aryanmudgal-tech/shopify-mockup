import type { Fee, Quote } from "../../shared/card";
import { formatUsd } from "../../shared/money";

/** Groups neighbouring lines that rest on the same quotes, so each quote shows once. */
export function groupByQuotes<T extends { quotes: Quote[] }>(lines: T[]): { lines: T[]; quotes: Quote[] }[] {
  const groups: { lines: T[]; quotes: Quote[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && sameQuotes(last.quotes, line.quotes)) last.lines.push(line);
    else groups.push({ lines: [line], quotes: line.quotes });
  }
  return groups;
}

function sameQuotes(a: Quote[], b: Quote[]): boolean {
  return a.length === b.length && a.every((q, i) => q.text === b[i]!.text && q.source === b[i]!.source);
}

/** "10% fee", "20% fee, capped at $250", "$49 flat fee", "no fee". */
export function describeFee(fee: Fee): string {
  switch (fee.type) {
    case "percent":
      return fee.capCents === null ? `${fee.percent}% fee` : `${fee.percent}% fee, capped at ${formatUsd(fee.capCents)}`;
    case "flat":
      return `${formatUsd(fee.cents)} flat fee`;
    case "none":
      return "no fee";
  }
}

/** "burrow.com/products/nomad-plus-sofa" for a pasted link, so the bubble stays short. */
export function shortLink(link: string): string {
  try {
    const u = new URL(link);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}`;
  } catch {
    return link;
  }
}

/** A resized image from Shopify's CDN, which takes a width parameter. */
export function thumb(url: string, width: number): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "cdn.shopify.com") return url;
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** "Nov 15, 2026" from an ISO time. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
