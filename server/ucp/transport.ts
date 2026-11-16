// One interface for everything the check reads from outside, so the data modes
// in spec section 9 swap only the transport. Catalog, cart, ask and the policy
// page parse the same shapes whether they came from the network or a fixture.

import type { CheckErrorCode, DataMode } from "../../shared/card";
import type { ProfileName } from "./profile";

/** "global" for Global Catalog, otherwise the store's seller.domain. */
export type Endpoint = "global" | string;

export interface CallOptions {
  /** Which agent profile to send. Defaults by tool: ask for ask_business, cap otherwise. */
  profile?: ProfileName;
}

export interface Transport {
  readonly mode: DataMode;
  /** ISO time the responses were fetched, for recorded mode; null when live. */
  readonly recordedAt: string | null;
  /** Calls a UCP tool (or "tools/list") and returns the JSON-RPC `result`, or throws UcpError. */
  call(endpoint: Endpoint, tool: string, args: Record<string, unknown>, opts?: CallOptions): Promise<UcpResult>;
  /** Fetches a web page the check reads: the refund policy, or a product page for the lookup fallback. */
  fetchPage(url: string): Promise<Page>;
  /** Follows a URL's redirects by hand and reports where it ends (the cart-route probe in server/handoff.ts). */
  probe(url: string): Promise<Probe>;
}

export interface Probe {
  /** Each hop's status and host, from the first request to the last. */
  hops: { status: number; host: string }[];
  /** Whether the last response says Shopify served it (the powered-by header). */
  servedByShopify: boolean;
}

export interface UcpResult {
  structuredContent?: any;
  content?: { type: string; text: string }[];
  isError?: boolean;
  tools?: { name: string }[];
}

export interface Page {
  /** The final URL after redirects. */
  url: string;
  html: string;
}

export class UcpError extends Error {
  constructor(
    readonly code: CheckErrorCode,
    message: string,
  ) {
    super(message);
  }
}
