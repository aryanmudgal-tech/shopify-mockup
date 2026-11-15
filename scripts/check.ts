// Runs one check from the terminal and prints what the card would show.
//
//   npx tsx scripts/check.ts <product link> [zip] [--recorded] [--json out.json] [--record dir]
//
// Live by default. --recorded answers from the verification fixtures instead.
// --record saves every call and page the live check makes into dir.

import { writeFileSync } from "node:fs";
import { loadDotEnv } from "../server/env";
import type { Card } from "../shared/card";
import { formatUsd } from "../shared/money";
import { runCheck } from "../server/check";
import { LiveTransport } from "../server/ucp/live";
import { RecordedTransport } from "../server/ucp/recorded";
import { RecordingTransport } from "../server/ucp/recording";

loadDotEnv();
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args.splice(i, 2)[1] ?? "");
};
const recorded = args.includes("--recorded") ? (args.splice(args.indexOf("--recorded"), 1), true) : false;
const jsonOut = flag("--json");
const recordDir = flag("--record");
const [link, zip = "14228"] = args;
if (!link) {
  console.error("usage: npx tsx scripts/check.ts <product link> [zip] [--recorded] [--json out.json]");
  process.exit(2);
}

const started = Date.now();
const base = recorded ? new RecordedTransport() : new LiveTransport();
const card = await runCheck(recordDir ? new RecordingTransport(base, recordDir) : base, link, zip);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(card, null, 2) + "\n");
print(card);
console.log(`\n${card.mode} check in ${seconds}s`);

function print(c: Card) {
  console.log(`${c.product.title.slice(0, 70)} | ${c.product.seller.name} | listed ${formatUsd(c.product.listedCents)}`);
  const b = c.toBuy;
  console.log(
    "To buy:",
    b.status === "priced" ? `${formatUsd(b.doorCents)} at the door (${formatUsd(b.deliveryCents)} ${b.deliveryLabel})` : JSON.stringify(b),
  );
  const s = c.tryFirst;
  console.log("Try it first:", s.status === "sample" ? `${formatUsd(s.priceCents)} ${s.title}` : JSON.stringify(s));
  const r = c.ifWrong;
  console.log(`If you're wrong: ${r.status} (policy ${r.sources.policy.status}, assistant ${r.sources.assistant.status})`);
  if (r.status === "terms") {
    for (const l of r.lines) {
      const amount = l.kind === "loss" ? ` ${formatUsd(l.lossCents)} ${l.condition ?? ""}` : "";
      console.log(`  - ${l.kind}${amount} [${l.quotes.map((q) => q.source).join(", ") || "no quote"}]`);
    }
    if (r.window) console.log(`  - window ${r.window.days} days from ${r.window.starts ?? "(not stated)"}`);
  } else if (r.status === "unreadable") {
    console.log(`  ${r.reason}`);
  }
  if (c.product.variantNote) console.log(`Note: ${c.product.variantNote}`);
  console.log("How I checked:");
  for (const st of c.steps) console.log(`  ${st.outcome.padEnd(6)} ${st.title}: ${st.summary.slice(0, 400)}`);
}
