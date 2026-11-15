// Agent profiles (spec 7.1). Shopify hosts no single 2026-08-25 example
// profile that declares both catalog/cart and ask, so each call sends the one
// it needs. Verified side by side on both stores (docs/verification.md 1).

import type { Endpoint, Transport } from "./transport";

export const PROFILES = {
  cap: "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json",
  ask: "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/ask.json",
} as const;

export type ProfileName = keyof typeof PROFILES;

export function defaultProfile(tool: string): ProfileName {
  return tool === "ask_business" ? "ask" : "cap";
}

/** Whether the store's endpoint lists `tool` for the given profile (UCP tools/list). */
export async function offersTool(t: Transport, endpoint: Endpoint, tool: string, profile: ProfileName): Promise<boolean> {
  const result = await t.call(endpoint, "tools/list", {}, { profile });
  return (result.tools ?? []).some((x) => x.name === tool);
}
