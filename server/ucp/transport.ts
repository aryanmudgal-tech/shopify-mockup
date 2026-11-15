// One interface for every Shopify call, so the data modes in spec section 9
// swap only the transport. Catalog, cart and ask parse the same response
// shapes whether they came from the network or from a fixture.

import type { CheckErrorCode, DataMode } from "../../shared/card";

/** "global" for Global Catalog, otherwise the store's seller.domain. */
export type Endpoint = "global" | string;

export interface UcpTransport {
  readonly mode: DataMode;
  /** ISO time the responses were fetched, for recorded mode; null when live. */
  readonly recordedAt: string | null;
  /** Calls a UCP tool and returns the JSON-RPC `result`, or throws UcpError. */
  call(endpoint: Endpoint, tool: string, args: Record<string, unknown>): Promise<UcpResult>;
}

export interface UcpResult {
  structuredContent?: any;
  content?: { type: string; text: string }[];
  isError?: boolean;
}

export class UcpError extends Error {
  constructor(
    readonly code: CheckErrorCode,
    message: string,
  ) {
    super(message);
  }
}
