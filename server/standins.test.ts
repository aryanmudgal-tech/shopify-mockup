// The stand-in terms must survive guardrail 1 on the recorded texts, and each
// source combination in spec 6.3 must land in the right state.

import { describe, expect, it } from "vitest";
import type { ReturnsSources } from "../shared/card";
import { askAssistant } from "./ask";
import { readRefundPolicy } from "./policy";
import { quoteHolds } from "./quotes";
import { standInReturns } from "./standins";
import { RecordedTransport } from "./ucp/recorded";

const BURROW = {
  domain: "burrow-prod.myshopify.com",
  variant: "gid://shopify/ProductVariant/50484946305326",
  policy: "https://checkout.shopify.com/93232202030/policies/45564592430.html",
};
const GARVEE = {
  domain: "mygarvee.myshopify.com",
  variant: "gid://shopify/ProductVariant/51296972898617",
  policy: "https://checkout.shopify.com/72466989369/policies/30681628985.html",
};

async function recordedSources(store: typeof BURROW): Promise<ReturnsSources> {
  const t = new RecordedTransport();
  return {
    policy: await readRefundPolicy(t, store.policy),
    assistant: await askAssistant(t, store.domain, store.variant, "14228"),
  };
}

const kinds = (row: ReturnType<typeof standInReturns>) => (row.status === "terms" ? row.lines.map((l) => l.kind) : row.status);

describe("stand-in returns on recorded texts", () => {
  it("Burrow: figures from the policy page, final sale from the assistant", async () => {
    const sources = await recordedSources(BURROW);
    expect(sources.policy.status).toBe("read");
    expect(sources.assistant.status).toBe("answered");

    const row = standInReturns(BURROW.domain, sources, 6900);
    expect(kinds(row)).toEqual(["loss", "loss", "delivery_refund_unstated", "exchange", "final_sale"]);
    if (row.status !== "terms") return;

    const loss = row.lines[0]!;
    expect(loss.quotes.every((q) => q.source === "policy")).toBe(true);
    expect(row.lines.find((l) => l.kind === "final_sale")!.quotes.map((q) => q.source)).toEqual(["assistant"]);
    expect(row.window?.quotes.every((q) => q.source === "policy")).toBe(true);

    for (const q of [...row.lines.flatMap((l) => l.quotes), ...(row.window?.quotes ?? [])]) {
      expect(quoteHolds(q, sources), q.text).toBe(true);
    }
  });

  it("Burrow with the policy page down: the assistant's terms, all labelled assistant", async () => {
    const sources = await recordedSources(BURROW);
    const row = standInReturns(BURROW.domain, { ...sources, policy: { status: "failed", url: BURROW.policy, reason: "HTTP 503" } }, 6900);
    expect(kinds(row)).toEqual(["loss", "loss", "delivery_refund_unstated", "exchange", "final_sale"]);
    if (row.status !== "terms") return;
    expect(row.lines.flatMap((l) => l.quotes).every((q) => q.source === "assistant")).toBe(true);
  });

  it("Burrow with the assistant down: policy terms stand, the final-sale note drops, delivery stays unstated", async () => {
    const sources = await recordedSources(BURROW);
    const row = standInReturns(BURROW.domain, { ...sources, assistant: { status: "failed", reason: "timed out" } }, 6900);
    expect(kinds(row)).toEqual(["loss", "loss", "delivery_refund_unstated", "exchange"]);
    if (row.status !== "terms") return;
    expect(row.lines[2]).toMatchObject({ kind: "delivery_refund_unstated", deliveryCents: 6900, quotes: [] });
  });

  it("Garvee: both fees charged, neither amount stated, quoted from the policy", async () => {
    const sources = await recordedSources(GARVEE);
    const row = standInReturns(GARVEE.domain, sources, 0);
    expect(kinds(row)).toEqual(["fee_unstated", "return_shipping_unstated"]);
    if (row.status !== "terms") return;
    expect(row.window).toMatchObject({ days: 30, starts: null });
  });

  it("is unreadable when neither source could be read, or the store has no stand-in yet", async () => {
    const failed: ReturnsSources = {
      policy: { status: "failed", url: null, reason: "none" },
      assistant: { status: "not_offered" },
    };
    expect(standInReturns(BURROW.domain, failed, 6900).status).toBe("unreadable");
    expect(standInReturns("other.myshopify.com", await recordedSources(BURROW), 0).status).toBe("unreadable");
  });

  it("drops a line whose quote isn't in the text actually read", async () => {
    const sources = await recordedSources(BURROW);
    if (sources.policy.status !== "read") throw new Error("policy not read");
    const edited = { ...sources, policy: { ...sources.policy, text: sources.policy.text.replace("capped at $250", "capped at $300") } };
    // Both fee lines rest on the cap sentence, so both drop, and with no cost
    // line left the row says it couldn't read the terms.
    const row = standInReturns(BURROW.domain, edited, 6900);
    expect(row.status).toBe("unreadable");
  });
});
