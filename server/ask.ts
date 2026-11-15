// The store's assistant through the Ask MCP (spec 7.5). Its answer is an
// AI-written summary, so the card labels it "The store's assistant" and uses
// it for what the policy page can't settle for this item.

import type { AssistantSource } from "../shared/card";
import { offersTool } from "./ucp/profile";
import type { Transport } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

/** Spec 7.5's question, with the exchange clause from revision 4. */
export function returnsQuestion(zip: string): string {
  return (
    `If I return this item after delivery to ${zip}, what will I pay? ` +
    "Include any restocking fee and whether it depends on packaging, who pays return shipping and how much, " +
    "whether original delivery charges are refunded, the return window and when it starts, " +
    "whether this item is final sale, and whether I can exchange it instead and on what terms."
  );
}

export async function askAssistant(t: Transport, storeDomain: string, variantId: string, zip: string): Promise<AssistantSource> {
  try {
    if (!(await offersTool(t, storeDomain, "ask_business", "ask"))) return { status: "not_offered" };
    const result = await t.call(storeDomain, "ask_business", {
      ask: {
        query: returnsQuestion(zip),
        ids: [variantId],
        context: { address_country: "US", postal_code: zip, language: "en" },
      },
    });
    const answer = result.structuredContent?.answer?.plain;
    if (typeof answer !== "string" || !answer.trim()) return { status: "failed", reason: "The assistant returned an empty answer." };
    return { status: "answered", text: answer };
  } catch (err) {
    return { status: "failed", reason: err instanceof UcpError ? err.message : "The assistant couldn't be reached." };
  }
}
