// Recorded mode: answers each call from the fixtures saved in the verification
// run (docs/verification.md), so the demo works with no network. Default mode
// for recording the video.

import { readFileSync } from "node:fs";
import type { CallOptions, Endpoint, Page, Probe, Transport, UcpResult } from "./transport";
import { UcpError } from "./transport";

const FIXTURES = new URL("../../fixtures/verification/", import.meta.url);

interface RecordedStore {
  dir: string;
  domain: string;
  /** Normalised product links (see lookupKey) and the lookup fixture for each. */
  lookups: Record<string, string>;
  tools: Record<string, string>;
  /** Storefront search fixtures, keyed by lower-case query. */
  searches: Record<string, string>;
  /** The refund policy page, keyed by the URL in seller.links. */
  pages: Record<string, string>;
}

const STORES: RecordedStore[] = [
  {
    dir: "burrow",
    domain: "burrow-prod.myshopify.com",
    lookups: {
      "burrow.com/products/nomad-plus-sofa?variant=50484946305326": "02b-global-lookup-url-with-variant.json",
      // The plain link is recorded too: Global Catalog answers not_found without ?variant=.
      "burrow.com/products/nomad-plus-sofa": "02a-global-lookup-plain-url-not-found.json",
    },
    tools: {
      "tools/list:cap": "03-tools-list-cap.json",
      "tools/list:ask": "03-tools-list-ask.json",
      create_cart: "04e-create-cart-zip-only-dest.json",
      cancel_cart: "04f-cancel-cart-e.json",
      ask_business: "07b-ask-returns-nomad-with-exchange.json",
    },
    searches: {
      "crushed gravel swatch": "05-store-search-crushed-gravel-swatch.json",
      swatch: "05-store-search-swatch.json",
    },
    pages: {
      "https://checkout.shopify.com/93232202030/policies/45564592430.html": "08c-refund-policy-page.html",
    },
  },
  {
    dir: "garvee",
    domain: "mygarvee.myshopify.com",
    lookups: {
      "garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?variant=51296972898617":
        "02-global-lookup-url-with-variant.json",
    },
    tools: {
      "tools/list:cap": "03-tools-list-cap.json",
      "tools/list:ask": "03-tools-list-ask.json",
      create_cart: "04c-create-cart-zip-only-dest.json",
      cancel_cart: "04d-cancel-cart-c.json",
      ask_business: "07b-ask-returns-with-exchange.json",
    },
    searches: {
      "corduroy swatch": "05-store-search-corduroy-swatch.json",
      swatch: "05-store-search-swatch.json",
      sample: "05-store-search-sample.json",
    },
    pages: {
      "https://checkout.shopify.com/72466989369/policies/30681628985.html": "08-refund-policy-page.html",
    },
  },
];

export const RECORDED_ZIP = "14228";

/** Host without www, path, and the variant parameter if present. */
export function lookupKey(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/$/, "");
  const variant = url.searchParams.get("variant");
  return variant ? `${host}${path}?variant=${variant}` : `${host}${path}`;
}

/** The demo links, for the footer shortcuts. */
export const RECORDED_LINKS = [
  "https://burrow.com/products/nomad-plus-sofa?variant=50484946305326",
  "https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?variant=51296972898617",
];

function readFixture(dir: string, file: string): { fetched_at: string; response: any } {
  return JSON.parse(readFileSync(new URL(`${dir}/${file}`, FIXTURES), "utf8"));
}

function unwrap(fixture: { response: any }): UcpResult {
  if (fixture.response.error) throw new UcpError("upstream", fixture.response.error.message ?? "UCP error");
  return fixture.response.result;
}

export class RecordedTransport implements Transport {
  readonly mode = "recorded" as const;
  readonly recordedAt = readFixture("burrow", "04e-create-cart-zip-only-dest.json").fetched_at;

  async call(endpoint: Endpoint, tool: string, args: Record<string, any>, opts: CallOptions = {}): Promise<UcpResult> {
    const zip = args.catalog?.context?.postal_code ?? args.cart?.context?.postal_code ?? args.ask?.context?.postal_code;
    if (zip && zip !== RECORDED_ZIP) {
      throw new UcpError("not_recorded", `Recorded mode only has ZIP ${RECORDED_ZIP}.`);
    }

    if (endpoint === "global") {
      if (tool !== "lookup_catalog") throw notRecorded(`Global Catalog ${tool}`);
      const key = lookupKey(args.catalog?.ids?.[0] ?? "");
      const store = STORES.find((s) => key && s.lookups[key]);
      if (!store || !key) {
        throw new UcpError(
          "not_recorded",
          "Recorded mode only has the two demo links. Paste one of them, or switch to live mode.",
        );
      }
      return unwrap(readFixture(store.dir, store.lookups[key]!));
    }

    const store = STORES.find((s) => s.domain === endpoint);
    if (!store) throw notRecorded(`the store ${endpoint}`);

    if (tool === "search_catalog") {
      const query = String(args.catalog?.query ?? "").toLowerCase();
      const file = store.searches[query];
      // A query that was never recorded behaves like an empty search.
      if (!file) return { structuredContent: { products: [] } };
      return unwrap(readFixture(store.dir, file));
    }

    const key = tool === "tools/list" ? `tools/list:${opts.profile ?? "cap"}` : tool;
    const file = store.tools[key];
    if (!file) throw notRecorded(`${tool} at ${endpoint}`);
    return unwrap(readFixture(store.dir, file));
  }

  async probe(url: string): Promise<Probe> {
    const host = new URL(url).hostname;
    const store = STORES.find((s) => s.domain === host);
    if (!store) throw notRecorded(`a probe of ${host}`);
    return JSON.parse(readFileSync(new URL(`${store.dir}/10-cart-route-probe.json`, FIXTURES), "utf8")).probe;
  }

  async fetchPage(url: string): Promise<Page> {
    const store = STORES.find((s) => s.pages[url]);
    if (!store) throw notRecorded(`the page ${url}`);
    return { url, html: readFileSync(new URL(`${store.dir}/${store.pages[url]}`, FIXTURES), "utf8") };
  }
}

function notRecorded(what: string): UcpError {
  return new UcpError("not_recorded", `No recorded response for ${what}.`);
}
