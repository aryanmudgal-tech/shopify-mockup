#!/usr/bin/env node
// Minimal UCP MCP client used for the verification run (spec section 11).
// No dependencies: Node 20+ fetch only.
//
// Usage:
//   node scripts/ucp.mjs <endpoint> tools/list [--profile cap|ask|<url>] [--save <path>]
//   node scripts/ucp.mjs <endpoint> <tool> '<arguments json>' [--profile cap|ask|<url>] [--save <path>]
//
// <endpoint> is "global" (Global Catalog), a store domain such as
// "burrow.com" (expands to https://burrow.com/api/ucp/mcp), or a full URL.
//
// The agent profile is injected as arguments.meta["ucp-agent"].profile.
// cancel_cart also gets a fresh meta["idempotency-key"], which the Cart MCP requires.
//
// With --save, the request, HTTP status and full response are written as JSON,
// so the file can be replayed by the app's `recorded` data mode.

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Shopify hosts no single 2026-08-25 example profile that declares both the
// catalog/cart capabilities and ask, so we use one of each (see docs/verification.md).
const PROFILES = {
  cap: "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json",
  ask: "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/ask.json",
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, flags };
}

function endpointUrl(endpoint) {
  if (endpoint === "global") return "https://catalog.shopify.com/api/ucp/mcp";
  if (endpoint.startsWith("http")) return endpoint;
  return `https://${endpoint}/api/ucp/mcp`;
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [endpoint, tool, rawArgs] = positional;
if (!endpoint || !tool) {
  console.error("usage: node scripts/ucp.mjs <endpoint> <tool|tools/list> ['<arguments json>'] [--profile cap|ask|<url>] [--save <path>]");
  process.exit(2);
}

const profile = PROFILES[flags.profile ?? (tool === "ask_business" ? "ask" : "cap")] ?? flags.profile;
const meta = { "ucp-agent": { profile } };
if (tool === "cancel_cart") meta["idempotency-key"] = randomUUID();

const body =
  tool === "tools/list"
    ? { jsonrpc: "2.0", method: "tools/list", id: 1, params: { arguments: { meta } } }
    : { jsonrpc: "2.0", method: "tools/call", id: 1, params: { name: tool, arguments: { meta, ...JSON.parse(rawArgs ?? "{}") } } };

const url = endpointUrl(endpoint);
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "MCP-Protocol-Version": "2026-03-26",
  },
  body: JSON.stringify(body),
  redirect: "follow",
});

const text = await res.text();
let response;
try {
  response = JSON.parse(text);
} catch {
  response = { non_json_body: text.slice(0, 2000) };
}

const record = { fetched_at: new Date().toISOString(), url, final_url: res.url, http_status: res.status, request: body, response };

if (flags.save) {
  mkdirSync(dirname(flags.save), { recursive: true });
  writeFileSync(flags.save, JSON.stringify(record, null, 2) + "\n");
}

process.stdout.write(JSON.stringify(record, null, 2) + "\n");
