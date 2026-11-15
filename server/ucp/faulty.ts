// A transport that answers from another one but fails or replaces chosen
// calls. Used by tests and by scripts/record-reads.ts to produce the empty and
// partial states on real recorded texts.

import type { CallOptions, Endpoint, Page, Transport, UcpResult } from "./transport";
import { UcpError } from "./transport";

export interface Faults {
  /** Tools that time out. */
  tools?: string[];
  /** Every page fetch fails (the policy page can't be read). */
  pages?: boolean;
  /** The store's tools/list doesn't offer ask_business. */
  noAsk?: boolean;
  replace?: (endpoint: Endpoint, tool: string, args: any) => UcpResult | Promise<UcpResult> | undefined;
  page?: (url: string) => Page | undefined;
}

export class FaultyTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly faults: Faults,
  ) {}

  get mode() {
    return this.inner.mode;
  }

  get recordedAt() {
    return this.inner.recordedAt;
  }

  async call(endpoint: Endpoint, tool: string, args: Record<string, unknown>, opts?: CallOptions): Promise<UcpResult> {
    if (this.faults.tools?.includes(tool)) throw new UcpError("upstream", `${tool} timed out`);
    if (this.faults.noAsk && tool === "tools/list" && opts?.profile === "ask") return { tools: [{ name: "search_catalog" }] };
    return (await this.faults.replace?.(endpoint, tool, args)) ?? this.inner.call(endpoint, tool, args, opts);
  }

  async fetchPage(url: string): Promise<Page> {
    const page = this.faults.page?.(url);
    if (page) return page;
    if (this.faults.pages) throw new UcpError("upstream", "checkout.shopify.com answered HTTP 503.");
    return this.inner.fetchPage(url);
  }
}
