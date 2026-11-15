// Stage 4's pass condition: model extraction + reconcile + cost reproduce the
// golden lines for Burrow and Garvee (server/golden/expected.ts), recorded and
// live, and the model picks Burrow's Chenille swatch over the Basketweave that
// ranks above it.
//
//   npm test                    recorded texts, saved model reads (no network, no key)
//   npm run test:golden:fresh   recorded texts, the model reads them again now
//   npm run test:golden:live    live Shopify calls, the model reads them again now

import { describe, expect, it } from "vitest";
import { runCheck } from "./check";
import { loadDotEnv } from "./env";
import type { ModelDeps } from "./extract";
import { GOLDEN, goldenView, sampleView } from "./golden/expected";
import { AnthropicModel } from "./model";
import { ModelCache } from "./modelCache";
import { quoteHolds } from "./quotes";
import { LiveTransport } from "./ucp/live";
import { RecordedTransport } from "./ucp/recorded";
import type { Transport } from "./ucp/transport";

loadDotEnv();
const FRESH = process.env.GOLDEN_FRESH === "1";
const LIVE = process.env.GOLDEN_LIVE === "1";

function deps(): ModelDeps {
  // Fresh: skip the saved reads so the model has to reproduce the lines itself.
  return FRESH ? { model: new AnthropicModel(), cache: new ModelCache("off") } : { model: null, cache: new ModelCache("readonly") };
}

const modes: [string, () => Transport][] = [["recorded", () => new RecordedTransport()]];
if (LIVE) modes.push(["live", () => new LiveTransport()]);

describe.skipIf(FRESH && !process.env.ANTHROPIC_API_KEY)("golden", () => {
  for (const [mode, transport] of modes) {
    for (const [store, c] of Object.entries(GOLDEN)) {
      it(`${store}, ${mode}${FRESH ? ", fresh model reads" : ", saved model reads"}`, async () => {
        const card = await runCheck(transport(), c.link, c.zip, deps());

        expect(goldenView(card.ifWrong)).toEqual(c.returns);
        expect(sampleView(card.tryFirst)).toEqual(c.sample);

        // Every quote on the row is a real passage of the source it names.
        if (card.ifWrong.status === "terms") {
          const quotes = [...card.ifWrong.lines.flatMap((l) => l.quotes), ...(card.ifWrong.window?.quotes ?? [])];
          for (const q of quotes) expect(quoteHolds(q, card.ifWrong.sources), `${q.source}: ${q.text}`).toBe(true);
        }
        // The model compared the swatch results itself.
        const sample = card.steps.find((s) => s.id === "sample")!;
        expect(sample.summary).toContain("claude-haiku-5-5");
      }, 180_000);
    }
  }
});
