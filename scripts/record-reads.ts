// Records the model reads the recorded demo and the tests replay, into
// fixtures/model-cache/. Needs ANTHROPIC_API_KEY in .env.
//
//   npx tsx scripts/record-reads.ts
//
// Covers both demo stores, plus Burrow with the policy page down (assistant
// only) and with no assistant (policy only), so those states run on real text.

import { runCheck } from "../server/check";
import { loadDotEnv } from "../server/env";
import { GOLDEN, goldenView } from "../server/golden/expected";
import { AnthropicModel } from "../server/model";
import { ModelCache } from "../server/modelCache";
import { FaultyTransport } from "../server/ucp/faulty";
import { RecordedTransport } from "../server/ucp/recorded";
import { isDeepStrictEqual } from "node:util";

loadDotEnv();
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Put ANTHROPIC_API_KEY in .env first (see .env.example).");
  process.exit(1);
}

const deps = { model: new AnthropicModel(), cache: new ModelCache("readwrite") };
const runs = [
  { name: "burrow", t: new RecordedTransport(), golden: GOLDEN.burrow },
  { name: "garvee", t: new RecordedTransport(), golden: GOLDEN.garvee },
  { name: "burrow, policy page down", t: new FaultyTransport(new RecordedTransport(), { pages: true }), golden: null },
  { name: "burrow, no assistant", t: new FaultyTransport(new RecordedTransport(), { noAsk: true }), golden: null },
];

for (const run of runs) {
  const link = run.golden?.link ?? GOLDEN.burrow.link;
  const card = await runCheck(run.t, link, "14228", deps);
  const extract = card.steps.find((s) => s.id === "extract")!;
  const verdict = run.golden ? (isDeepStrictEqual(goldenView(card.ifWrong), run.golden.returns) ? "matches golden" : "DIFFERS from golden") : card.ifWrong.status;
  console.log(`${run.name}: ${verdict}\n  ${extract.summary}`);
}
