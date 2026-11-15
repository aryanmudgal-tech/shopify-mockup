// A file cache for model reads, so live runs are fast and repeatable and the
// recorded demo runs with no network and no key.
//
// Extractions are keyed by a hash of the policy text, the assistant's answer
// and the variant ID, plus the model and the prompt version, so a changed
// prompt or model never serves an old answer. Swatch matches are keyed by the
// fabric and the search results. Entries live in fixtures/model-cache/ and are
// committed: the recorded demo replays them.
//
// MODEL_CACHE=readwrite (default) reads and writes, readonly never writes,
// off ignores the cache (used to prove the model reproduces the golden output).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type CacheMode = "readwrite" | "readonly" | "off";

const DEFAULT_DIR = new URL("../fixtures/model-cache/", import.meta.url);

export class ModelCache {
  constructor(
    readonly mode: CacheMode = "readwrite",
    private readonly dir: URL = DEFAULT_DIR,
  ) {}

  static key(parts: unknown): string {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }

  private file(kind: string, key: string): URL {
    return new URL(`${kind}/${key}.json`, this.dir);
  }

  get<T>(kind: string, key: string): T | null {
    if (this.mode === "off") return null;
    const file = this.file(kind, key);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  }

  put(kind: string, key: string, value: unknown): void {
    if (this.mode !== "readwrite") return;
    mkdirSync(new URL(`${kind}/`, this.dir), { recursive: true });
    writeFileSync(this.file(kind, key), JSON.stringify(value, null, 2) + "\n");
  }
}

export function cacheFromEnv(): ModelCache {
  const mode = process.env.MODEL_CACHE;
  return new ModelCache(mode === "off" || mode === "readonly" ? mode : "readwrite");
}
