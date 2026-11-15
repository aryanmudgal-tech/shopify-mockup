// Live mode: real calls to Global Catalog, the store's UCP endpoint and the
// store's refund policy page. Same request shapes as the verification run
// (scripts/ucp.mjs).

import { randomUUID } from "node:crypto";
import { defaultProfile, PROFILES } from "./profile";
import type { CallOptions, Endpoint, Page, Transport, UcpResult } from "./transport";
import { UcpError } from "./transport";

const MCP_PROTOCOL_VERSION = "2026-03-26";
const PAGE_LIMIT_BYTES = 2_000_000;

// ask_business writes its answer with a model, so it gets longer than the rest.
const TIMEOUT_MS: Record<string, number> = { ask_business: 45_000 };
const DEFAULT_TIMEOUT_MS = 20_000;

export function endpointUrl(endpoint: Endpoint): string {
  return endpoint === "global" ? "https://catalog.shopify.com/api/ucp/mcp" : `https://${endpoint}/api/ucp/mcp`;
}

export class LiveTransport implements Transport {
  readonly mode = "live" as const;
  readonly recordedAt = null;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async call(endpoint: Endpoint, tool: string, args: Record<string, unknown>, opts: CallOptions = {}): Promise<UcpResult> {
    const meta: Record<string, unknown> = { "ucp-agent": { profile: PROFILES[opts.profile ?? defaultProfile(tool)] } };
    // The Cart MCP requires an idempotency key to cancel (verification run).
    if (tool === "cancel_cart") meta["idempotency-key"] = randomUUID();

    const body =
      tool === "tools/list"
        ? { jsonrpc: "2.0", method: "tools/list", id: 1, params: { arguments: { meta } } }
        : { jsonrpc: "2.0", method: "tools/call", id: 1, params: { name: tool, arguments: { meta, ...args } } };

    const where = endpoint === "global" ? "Global Catalog" : endpoint;
    let res: Response;
    try {
      res = await this.fetchImpl(endpointUrl(endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS[tool] ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      throw new UcpError("upstream", `${tool} at ${where} didn't respond (${errorName(err)}).`);
    }

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // Garvee's storefront host answers /api/ucp/mcp with a web page, for example.
      throw new UcpError("upstream", `${where} didn't answer ${tool} as UCP (HTTP ${res.status}).`);
    }
    if (json.error) throw new UcpError("upstream", `${tool} at ${where} failed: ${json.error.message ?? "unknown error"}.`);
    const result: UcpResult | undefined = json.result;
    if (!result) throw new UcpError("upstream", `${tool} at ${where} returned no result.`);
    if (result.isError) {
      const detail = result.content?.[0]?.text?.slice(0, 200) ?? "no detail";
      throw new UcpError("upstream", `${tool} at ${where} returned an error: ${detail}`);
    }
    return result;
  }

  async fetchPage(url: string): Promise<Page> {
    assertPublicHttps(url);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "text/html", "User-Agent": "BeforeYouBuy/0.1 (prototype)" },
        redirect: "follow",
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      throw new UcpError("upstream", `${new URL(url).hostname} didn't respond (${errorName(err)}).`);
    }
    if (!res.ok) throw new UcpError("upstream", `${new URL(url).hostname} answered HTTP ${res.status}.`);
    const html = await res.text();
    if (html.length > PAGE_LIMIT_BYTES) throw new UcpError("upstream", "The page was too large to read.");
    return { url: res.url || url, html };
  }
}

/**
 * The server fetches pages named by Shopify data or pasted by the buyer, so it
 * refuses anything that isn't plain public HTTPS.
 */
export function assertPublicHttps(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UcpError("bad_input", "That isn't a web address.");
  }
  const host = u.hostname;
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":");
  if (u.protocol !== "https:" || privateHost) {
    throw new UcpError("bad_input", "Only public https pages can be read.");
  }
}

function errorName(err: unknown): string {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timed out";
  return err instanceof Error ? err.message : "network error";
}
