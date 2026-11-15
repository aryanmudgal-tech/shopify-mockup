import { describe, expect, it } from "vitest";
import type { ReturnLine } from "../../shared/card";
import { describeFee, groupByQuotes, shortLink } from "./format";

describe("groupByQuotes", () => {
  it("shows a shared quote once under neighbouring lines", () => {
    const q = [{ text: "the fee is 10% or 20%", source: "policy" as const }];
    const lines: ReturnLine[] = [
      { kind: "fee_unstated", quotes: q },
      { kind: "return_shipping_unstated", quotes: [{ ...q[0]! }] },
      // Same words from the assistant are a different quote.
      { kind: "exchange", count: 1, conditions: "original box", quotes: [{ text: "the fee is 10% or 20%", source: "assistant" }] },
    ];
    const groups = groupByQuotes(lines);
    expect(groups.map((g) => g.lines.length)).toEqual([2, 1]);
    expect(groups[0]!.quotes).toEqual(q);
  });
});

describe("describeFee", () => {
  it("names the cap when there is one", () => {
    expect(describeFee({ type: "percent", percent: 10, capCents: null })).toBe("10% fee");
    expect(describeFee({ type: "percent", percent: 20, capCents: 25000 })).toBe("20% fee, capped at $250");
    expect(describeFee({ type: "flat", cents: 4900 })).toBe("$49 flat fee");
  });
});

describe("shortLink", () => {
  it("drops the scheme, www and query", () => {
    expect(shortLink("https://www.garvee.com/products/sofa?variant=1")).toBe("garvee.com/products/sofa");
  });
});
