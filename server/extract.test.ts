// The extractor's checks and retry, against a scripted fake model. No API calls.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReturnsSources } from "../shared/card";
import { checkTerms, extractReturns, mentionsNumber, type ItemContext } from "./extract";
import { MODEL_ID, type ModelClient, type ToolRequest, type ToolResponse } from "./model";
import { ModelCache } from "./modelCache";

const POLICY =
  "We charge a return shipping fee equal to 10% of what you paid, with the original packaging intact. " +
  "If you don't have the original packaging, the fee is 20% of the paid value. The fee is always capped at $250. " +
  "Returns must start within 30 days of delivery.";

const ITEM: ItemContext = { title: "Test Sofa", options: [{ name: "Fabric", label: "Oat" }], seller: "Test", variantId: "gid://v/1" };

function input(patch: Record<string, unknown> = {}) {
  return {
    window: { days: 30, starts: "delivery", quotes: ["Returns must start within 30 days of delivery."] },
    fees_by_condition: [
      {
        condition: "with_original_packaging",
        fee: { type: "percent", percent: 10, amount: null, cap: 250 },
        quotes: ["return shipping fee equal to 10% of what you paid, with the original packaging intact", "The fee is always capped at $250."],
      },
    ],
    return_shipping: { type: "included_in_fee", amount: null, quotes: ["We charge a return shipping fee"] },
    original_delivery_refunded: { value: null, quotes: [] },
    exchange: { free: null, count: null, needs_original_packaging: null, within_return_window: null, quotes: [] },
    final_sale: { value: null, quotes: [] },
    ...patch,
  };
}

class FakeModel implements ModelClient {
  // The real model's ID, so the cache key matches a keyless run's.
  readonly model = MODEL_ID;
  calls: ToolRequest[] = [];
  constructor(private replies: unknown[]) {}
  async callTool(req: ToolRequest): Promise<ToolResponse> {
    this.calls.push(req);
    const reply = this.replies[Math.min(this.calls.length - 1, this.replies.length - 1)];
    return { input: reply, assistant: { role: "assistant", content: "…" }, toolUseId: `t${this.calls.length}` };
  }
}

const tempCache = () => new ModelCache("readwrite", pathToFileURL(mkdtempSync(join(tmpdir(), "byb-cache-")) + "/"));
const SOURCES: ReturnsSources = { policy: { status: "read", url: "#", text: POLICY }, assistant: { status: "not_offered" } };

describe("mentionsNumber", () => {
  it("finds digits, currency, decimals and number words, but not digits inside other numbers", () => {
    expect(mentionsNumber("equal to 10% of", 10)).toBe(true);
    expect(mentionsNumber("capped at $250.", 250)).toBe(true);
    expect(mentionsNumber("$49.50 fee", 49.5)).toBe(true);
    expect(mentionsNumber("$1,000 cap", 1000)).toBe(true);
    expect(mentionsNumber("one free exchange", 1)).toBe(true);
    expect(mentionsNumber("a 30-day window", 30)).toBe(true);
    expect(mentionsNumber("within 300 days", 30)).toBe(false);
    expect(mentionsNumber("a 15% fee", 10)).toBe(false);
  });
});

describe("checkTerms", () => {
  it("keeps values whose quotes are exact passages containing their numbers, tagged with the source", () => {
    const { terms, problems } = checkTerms(input(), POLICY, "policy");
    expect(problems).toEqual([]);
    expect(terms.fees_by_condition[0]!.fee).toEqual({ type: "percent", percent: 10, amount: null, cap: 250 });
    expect(terms.window.quotes[0]).toEqual({ text: "Returns must start within 30 days of delivery.", source: "policy" });
  });

  it("drops a value whose quote isn't in the text", () => {
    const { terms, problems } = checkTerms(
      input({ window: { days: 30, starts: "delivery", quotes: ["You have 30 days to return it."] } }),
      POLICY,
      "policy",
    );
    expect(problems[0]).toContain("not an exact passage");
    expect(terms.window.days).toBeNull();
  });

  it("drops a number that isn't in its own quotes, even if the quote is real", () => {
    const bad = input({
      fees_by_condition: [
        { condition: "any", fee: { type: "percent", percent: 15, amount: null, cap: null }, quotes: ["We charge a return shipping fee"] },
      ],
    });
    const { terms, problems } = checkTerms(bad, POLICY, "policy");
    expect(problems).toEqual(["fees_by_condition[any]: the quotes don't contain the number 15."]);
    expect(terms.fees_by_condition).toEqual([]);
  });

  it("drops a stated value with no quote", () => {
    const { terms, problems } = checkTerms(input({ final_sale: { value: true, quotes: [] } }), POLICY, "policy");
    expect(problems).toEqual(["final_sale: a value is recorded but no quote supports it."]);
    expect(terms.final_sale.value).toBeNull();
  });

  it("matches quotes across line breaks and extra spaces", () => {
    const text = "the buyer will be responsible\nfor covering the cost of returning";
    const { problems } = checkTerms(
      input({
        window: { days: null, starts: null, quotes: [] },
        fees_by_condition: [],
        return_shipping: { type: "customer_pays_unstated", amount: null, quotes: ["the buyer will be responsible for covering the cost of returning"] },
      }),
      text,
      "policy",
    );
    expect(problems).toEqual([]);
  });
});

describe("extractReturns", () => {
  it("retries once with the problems as a tool error, then keeps the corrected read", async () => {
    const wrong = input({ window: { days: 30, starts: "delivery", quotes: ["Returns within thirty days."] } });
    const model = new FakeModel([wrong, input()]);
    const x = await extractReturns({ model, cache: tempCache() }, ITEM, SOURCES, "14228");

    expect(model.calls).toHaveLength(2);
    const retry = model.calls[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(JSON.stringify(retry[2])).toContain("is_error");
    expect(JSON.stringify(retry[2])).toContain("not an exact passage");
    expect(x.policy).toMatchObject({ attempts: 2, dropped: [], error: null });
    expect(x.policy?.terms?.window.days).toBe(30);
  });

  it("drops what still fails after the retry, and keeps the rest", async () => {
    const wrong = input({ window: { days: 30, starts: "delivery", quotes: ["Returns within thirty days."] } });
    const model = new FakeModel([wrong, wrong]);
    const x = await extractReturns({ model, cache: tempCache() }, ITEM, SOURCES, "14228");
    expect(x.policy?.dropped).toHaveLength(1);
    expect(x.policy?.terms?.window.days).toBeNull();
    expect(x.policy?.terms?.fees_by_condition).toHaveLength(1);
  });

  it("caches by the texts and the variant, and serves a repeat run without the model", async () => {
    const cache = tempCache();
    const model = new FakeModel([input()]);
    await extractReturns({ model, cache }, ITEM, SOURCES, "14228");
    const again = await extractReturns({ model: null, cache }, ITEM, SOURCES, "14228");
    expect(again.cached).toBe(true);
    expect(model.calls).toHaveLength(1);

    // A different variant is a different key.
    const other = await extractReturns({ model: null, cache }, { ...ITEM, variantId: "gid://v/2" }, SOURCES, "14228");
    expect(other.policy?.error).toContain("no ANTHROPIC_API_KEY");
  });

  it("reads each source in its own call, so the model can't blend them", async () => {
    const model = new FakeModel([input()]);
    const sources: ReturnsSources = { policy: SOURCES.policy, assistant: { status: "answered", text: POLICY } };
    await extractReturns({ model, cache: tempCache() }, ITEM, sources, "14228");
    expect(model.calls).toHaveLength(2);
    const prompts = model.calls.map((c) => String(c.messages[0]!.content));
    expect(prompts.some((p) => p.includes("refund policy page"))).toBe(true);
    expect(prompts.some((p) => p.includes("AI-written answer from the store's assistant"))).toBe(true);
  });
});
