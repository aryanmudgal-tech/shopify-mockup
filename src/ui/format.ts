import type { Fee } from "../../shared/card";
import { formatUsd } from "../../shared/money";

/** Groups neighbouring lines that rest on the same quotes, so each quote shows once. */
export function groupByQuotes<T extends { quotes: string[] }>(lines: T[]): { lines: T[]; quotes: string[] }[] {
  const groups: { lines: T[]; quotes: string[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && sameQuotes(last.quotes, line.quotes)) last.lines.push(line);
    else groups.push({ lines: [line], quotes: line.quotes });
  }
  return groups;
}

function sameQuotes(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((q, i) => q === b[i]);
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

/** "Nov 15, 2026" from an ISO time. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
