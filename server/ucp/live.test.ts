// The live transport's request shapes and error handling, against a fake fetch.

import { describe, expect, it } from "vitest";
import { assertPublicHttps, LiveTransport } from "./live";
import { PROFILES } from "./profile";

function fakeFetch(reply: { status?: number; body: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(reply.body, { status: reply.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls, body: (i = 0) => JSON.parse(String(calls[i]!.init.body)) };
}

const ok = (result: unknown) => ({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }) });

describe("LiveTransport.call", () => {
  it("sends the catalog profile to the store endpoint by default", async () => {
    const f = fakeFetch(ok({ structuredContent: { products: [] } }));
    await new LiveTransport(f.impl).call("mygarvee.myshopify.com", "search_catalog", { catalog: { query: "swatch" } });

    expect(f.calls[0]!.url).toBe("https://mygarvee.myshopify.com/api/ucp/mcp");
    expect((f.calls[0]!.init.headers as Record<string, string>)["MCP-Protocol-Version"]).toBe("2026-03-26");
    expect(f.body()).toMatchObject({
      method: "tools/call",
      params: { name: "search_catalog", arguments: { meta: { "ucp-agent": { profile: PROFILES.cap } }, catalog: { query: "swatch" } } },
    });
  });

  it("sends the ask profile to ask_business and to Global Catalog's own URL", async () => {
    const f = fakeFetch(ok({ structuredContent: {} }));
    const t = new LiveTransport(f.impl);
    await t.call("burrow-prod.myshopify.com", "ask_business", { ask: {} });
    await t.call("global", "lookup_catalog", { catalog: { ids: [] } });

    expect(f.body(0).params.arguments.meta["ucp-agent"].profile).toBe(PROFILES.ask);
    expect(f.calls[1]!.url).toBe("https://catalog.shopify.com/api/ucp/mcp");
  });

  it("adds an idempotency key to cancel_cart only", async () => {
    const f = fakeFetch(ok({ structuredContent: {} }));
    const t = new LiveTransport(f.impl);
    await t.call("burrow-prod.myshopify.com", "cancel_cart", { id: "gid://shopify/Cart/1?key=2" });
    await t.call("burrow-prod.myshopify.com", "create_cart", { cart: {} });

    expect(f.body(0).params.arguments.meta["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.body(0).params.arguments.id).toBe("gid://shopify/Cart/1?key=2");
    expect(f.body(1).params.arguments.meta["idempotency-key"]).toBeUndefined();
  });

  it("lists tools with the profile asked for", async () => {
    const f = fakeFetch(ok({ tools: [{ name: "ask_business" }] }));
    const result = await new LiveTransport(f.impl).call("burrow-prod.myshopify.com", "tools/list", {}, { profile: "ask" });

    expect(f.body()).toMatchObject({ method: "tools/list", params: { arguments: { meta: { "ucp-agent": { profile: PROFILES.ask } } } } });
    expect(result.tools).toEqual([{ name: "ask_business" }]);
  });

  it("turns a web page, a JSON-RPC error and a tool error into UcpError", async () => {
    const page = fakeFetch({ body: "<!DOCTYPE html><html></html>" });
    await expect(new LiveTransport(page.impl).call("www.garvee.com", "create_cart", {})).rejects.toMatchObject({
      code: "upstream",
      message: expect.stringContaining("didn't answer create_cart as UCP"),
    });

    const rpc = fakeFetch({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid_cart_id" } }) });
    await expect(new LiveTransport(rpc.impl).call("x.myshopify.com", "cancel_cart", {})).rejects.toMatchObject({
      message: expect.stringContaining("invalid_cart_id"),
    });

    const tool = fakeFetch(ok({ isError: true, content: [{ type: "text", text: "Variant not found" }] }));
    await expect(new LiveTransport(tool.impl).call("x.myshopify.com", "create_cart", {})).rejects.toMatchObject({
      message: expect.stringContaining("Variant not found"),
    });
  });
});

describe("LiveTransport.fetchPage", () => {
  it("returns the page and refuses error statuses", async () => {
    const f = fakeFetch({ body: "<p>Returns</p>" });
    await expect(new LiveTransport(f.impl).fetchPage("https://checkout.shopify.com/1/policies/2.html")).resolves.toMatchObject({
      html: "<p>Returns</p>",
    });

    const missing = fakeFetch({ status: 404, body: "" });
    await expect(new LiveTransport(missing.impl).fetchPage("https://checkout.shopify.com/x")).rejects.toMatchObject({
      message: expect.stringContaining("HTTP 404"),
    });
  });
});

describe("assertPublicHttps", () => {
  it("allows public https and refuses everything else", () => {
    expect(() => assertPublicHttps("https://burrow.com/products/nomad-plus-sofa")).not.toThrow();
    for (const bad of ["http://burrow.com", "https://localhost:5173", "https://127.0.0.1/x", "https://[::1]/", "file:///etc/hosts"]) {
      expect(() => assertPublicHttps(bad), bad).toThrow();
    }
  });
});
