// Saves every call and page a live check makes, so a run can be read back
// later (the generalization run in docs/verification.md section 9).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CallOptions, Endpoint, Page, Transport, UcpResult } from "./transport";

export class RecordingTransport implements Transport {
  private n = 0;

  constructor(
    private readonly inner: Transport,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  get mode() {
    return this.inner.mode;
  }

  get recordedAt() {
    return this.inner.recordedAt;
  }

  private name(what: string): string {
    this.n += 1;
    return join(this.dir, `${String(this.n).padStart(2, "0")}-${what.replace(/[^a-z0-9._-]+/gi, "-")}`);
  }

  async call(endpoint: Endpoint, tool: string, args: Record<string, unknown>, opts?: CallOptions): Promise<UcpResult> {
    const file = this.name(`${endpoint === "global" ? "global" : "store"}-${tool}${opts?.profile ? `-${opts.profile}` : ""}`);
    try {
      const result = await this.inner.call(endpoint, tool, args, opts);
      writeFileSync(`${file}.json`, JSON.stringify({ fetched_at: new Date().toISOString(), endpoint, tool, args, result }, null, 2) + "\n");
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      writeFileSync(`${file}.json`, JSON.stringify({ fetched_at: new Date().toISOString(), endpoint, tool, args, error }, null, 2) + "\n");
      throw err;
    }
  }

  async fetchPage(url: string): Promise<Page> {
    const file = this.name("page");
    try {
      const page = await this.inner.fetchPage(url);
      writeFileSync(`${file}.html`, page.html);
      writeFileSync(`${file}.json`, JSON.stringify({ fetched_at: new Date().toISOString(), url, final_url: page.url }, null, 2) + "\n");
      return page;
    } catch (err) {
      writeFileSync(`${file}.json`, JSON.stringify({ url, error: err instanceof Error ? err.message : String(err) }, null, 2) + "\n");
      throw err;
    }
  }
}
