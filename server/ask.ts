// The returns question through the Ask MCP (spec 7.5). The policy-page
// fallback arrives with live calls in stage 3.

import type { UcpTransport } from "./ucp/transport";

/**
 * Spec 7.5's question plus the exchange clause accepted on 2026-11-15
 * (docs/verification.md section 6, proposal 4).
 */
export function returnsQuestion(zip: string): string {
  return (
    `If I return this item after delivery to ${zip}, what will I pay? ` +
    "Include any restocking fee and whether it depends on packaging, who pays return shipping and how much, " +
    "whether original delivery charges are refunded, the return window and when it starts, " +
    "whether this item is final sale, and whether I can exchange it instead and on what terms."
  );
}

export async function askReturns(
  t: UcpTransport,
  storeDomain: string,
  variantId: string,
  zip: string,
): Promise<{ answer: string } | null> {
  const result = await t.call(storeDomain, "ask_business", {
    ask: {
      query: returnsQuestion(zip),
      ids: [variantId],
      context: { address_country: "US", postal_code: zip, language: "en" },
    },
  });
  const answer = result.structuredContent?.answer?.plain;
  return typeof answer === "string" && answer.trim() ? { answer } : null;
}
