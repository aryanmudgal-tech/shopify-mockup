// Guardrail 3 for the swatch matcher, against a scripted fake model.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ModelClient, ToolRequest, ToolResponse } from "./model";
import { ModelCache } from "./modelCache";
import { matchSwatch } from "./swatch";

const results = JSON.parse(
  readFileSync(new URL("../fixtures/verification/burrow/05-store-search-crushed-gravel-swatch.json", import.meta.url), "utf8"),
).response.result.structuredContent.products as any[];

const FABRIC = { name: "Fabric", label: "Crushed Gravel - Performance Chenille" };

class FakeModel implements ModelClient {
  readonly model = "fake-model";
  calls: ToolRequest[] = [];
  constructor(private reply: unknown) {}
  async callTool(req: ToolRequest): Promise<ToolResponse> {
    this.calls.push(req);
    return { input: this.reply, assistant: { role: "assistant", content: "…" }, toolUseId: "t1" };
  }
}

const off = new ModelCache("off");

describe("matchSwatch", () => {
  it("ranks Basketweave first in Burrow's recorded results, so the order alone would pick wrong", () => {
    expect(results[0].title).toBe("Crushed Gravel Performance Basketweave");
    expect(results.findIndex((p) => p.title === "Crushed Gravel Performance Chenille")).toBeGreaterThan(0);
  });

  it("accepts a match whose product and variant IDs are in the results", async () => {
    const chenille = results.find((p) => p.title === "Crushed Gravel Performance Chenille");
    const model = new FakeModel({ reason: "Same colour and weave.", match: { product_id: chenille.id, variant_id: chenille.variants[0].id } });
    const d = await matchSwatch({ model, cache: off }, FABRIC, "Crushed Gravel swatch", results);
    expect(d.match).toMatchObject({ variantId: "gid://shopify/ProductVariant/50269421830446", priceCents: 100 });
    expect(d.rejected).toBeNull();
    // The model sees the search results, not the order they'd be picked in.
    expect(String(model.calls[0]!.messages[0]!.content)).toContain("Crushed Gravel - Performance Basketweave");
  });

  it("rejects an ID that isn't in the results", async () => {
    const model = new FakeModel({ reason: "Looks right.", match: { product_id: "gid://shopify/Product/1", variant_id: "gid://shopify/ProductVariant/2" } });
    const d = await matchSwatch({ model, cache: off }, FABRIC, "Crushed Gravel swatch", results);
    expect(d.match).toBeNull();
    expect(d.rejected).toContain("isn't in the search results");
  });

  it("rejects a variant that belongs to a different product", async () => {
    const [a, b] = results;
    const model = new FakeModel({ reason: "Mixed up.", match: { product_id: a.id, variant_id: b.variants[0].id } });
    const d = await matchSwatch({ model, cache: off }, FABRIC, "Crushed Gravel swatch", results);
    expect(d.match).toBeNull();
  });

  it("needs the model or a saved read", async () => {
    await expect(matchSwatch({ model: null, cache: off }, FABRIC, "Crushed Gravel swatch", results)).rejects.toThrow("no ANTHROPIC_API_KEY");
  });
});
