// HTTP routes. POST /api/check runs one check; GET /api/config tells the page
// which data mode is active (shown in the footer, spec section 9).

import type { IncomingMessage, ServerResponse } from "node:http";
import type { CheckResponse, DataMode } from "../shared/card";
import { runCheck } from "./check";
import { localizeImages } from "./media";
import { LiveTransport } from "./ucp/live";
import { RECORDED_LINKS, RecordedTransport } from "./ucp/recorded";
import type { Transport } from "./ucp/transport";
import { UcpError } from "./ucp/transport";

const MODE = (process.env.DATA_MODE ?? "recorded") as DataMode;

function transport(): Transport {
  if (MODE === "recorded") return new RecordedTransport();
  if (MODE === "live") return new LiveTransport();
  // Mock is only for the case where Shopify access fails, which it hasn't.
  throw new UcpError("mode_unavailable", `The ${MODE} data mode isn't built. Run with DATA_MODE=recorded or live.`);
}

export interface ConfigResponse {
  mode: DataMode;
  recordedAt: string | null;
  demoLinks: string[];
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/api/config") {
    const recordedAt = MODE === "recorded" ? new RecordedTransport().recordedAt : null;
    return json(res, 200, { mode: MODE, recordedAt, demoLinks: MODE === "recorded" ? RECORDED_LINKS : [] });
  }

  if (req.method === "POST" && req.url === "/api/check") {
    const body = await readJson(req);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const zip = typeof body?.zip === "string" ? body.zip.trim() : "";
    if (!isProductLink(url)) return fail(res, 400, "bad_input", "That doesn't look like a product link.");
    if (!/^\d{5}$/.test(zip)) return fail(res, 400, "bad_input", "A US ZIP code is five digits.");

    try {
      const checked = await runCheck(transport(), url, zip);
      // Recorded mode shows saved copies of the images, if there are any, so the take needs no network.
      const card = MODE === "recorded" ? localizeImages(checked) : checked;
      return json<CheckResponse>(res, 200, { ok: true, card });
    } catch (err) {
      if (err instanceof UcpError) {
        return fail(res, err.code === "upstream" ? 502 : 422, err.code, err.message);
      }
      throw err;
    }
  }

  return fail(res, 404, "bad_input", "No such route.");
}

export function isProductLink(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fail(res: ServerResponse, status: number, code: any, message: string) {
  json<CheckResponse>(res, status, { ok: false, error: { code, message } });
}

function json<T>(res: ServerResponse, status: number, body: T) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
