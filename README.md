# Before You Buy

A first-time renter finds a sofa through ChatGPT and asks whether to buy it. They see one price, but three things decide it: what it costs at their door, whether there's a cheap way to try it first, and what it costs if they're wrong. Before You Buy is the check an agent runs before it hands the buyer to checkout. It answers those three questions from Shopify's own data, quotes the store, and names the source of every figure.

It's a take-home prototype for Shopify, built on the Shopify Catalog API and the Universal Commerce Protocol (UCP). The design is in [`docs/specs/2026-11-15-before-you-buy-design.md`](docs/specs/2026-11-15-before-you-buy-design.md), and every claim about the APIs is checked in [`docs/verification.md`](docs/verification.md).

## Run it

You need Node 20.12 or later.

```bash
npm install
npm run dev
```

Open http://localhost:5173. This is **recorded mode**: every Shopify response comes from the verification run, so it works with no network and no API key. Paste one of the two demo links (they're also in the footer), then ZIP 14228:

- Burrow Nomad Sofa: `https://burrow.com/products/nomad-plus-sofa?variant=50484946305326`
- Garvee 137" Cloud Sectional: `https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?variant=51296972898617`

Two extra views:

- `?states` shows every empty and partial state on mock data.
- `?clean` hides the footer shortcuts for a screen recording. The data-mode label stays.

### Live mode

Live mode calls Shopify for real and lets the model read stores it hasn't seen. Copy `.env.example` to `.env` and paste your Anthropic API key after `ANTHROPIC_API_KEY=`. The key stays on the server, and `.env` is git-ignored.

```bash
npm run dev:live
```

Open http://localhost:5174 and paste any Shopify product link. You can also run one check from the terminal:

```bash
npx tsx scripts/check.ts "https://burrow.com/products/nomad-plus-sofa?variant=50484946305326" 14228
```

## How a check works

1. **Identify the product.** Global Catalog `lookup_catalog` with the pasted link. If the link doesn't resolve, the app searches the Catalog for the product page's title, and the card says when it had to pick a variant.
2. **Price at the door.** The store's Cart MCP prices one sofa to the ZIP (country plus ZIP is enough), then the cart is cancelled.
3. **Try it first.** The store's catalog is searched for a swatch in the sofa's fabric. The model picks the match, and code checks the ID is really in the results.
4. **If you return it.** The app reads the store's refund policy page and asks the store's assistant (`ask_business`). The model reads each source separately into structured terms, and every quote and number is checked against its source. Code then compares the two sources field by field, does all the arithmetic, and fails closed if the figures don't account for the store's words.
5. **Hand-off.** "Order the sample" and "Buy it" open the store's own checkout. If a store's checkout links can't open from outside its site, the button says "View on the store's site" instead.

The model is `claude-haiku-5-5` with a forced, strict tool call. Its reads are saved in `fixtures/model-cache/`, keyed by the texts it read, so repeat runs are fast and the recorded demo needs no key.

## Tests

```bash
npm test
```

That runs 81 tests with no network and no key, including the golden test: the model's reads plus the arithmetic must reproduce the Burrow and Garvee cards exactly. Two more runs make the model read again instead of using saved reads (both need the key):

```bash
npm run test:golden:fresh
```

```bash
npm run test:golden:live
```

## Scripts

| Script | What it does |
|---|---|
| `scripts/check.ts` | Runs one check from the terminal; `--recorded` uses the fixtures, `--record <dir>` saves every call |
| `scripts/record-reads.ts` | Re-records the saved model reads for the demo and the tests |
| `scripts/check-handoffs.ts` | Follows the demo's checkout links once and records where they land |
| `scripts/record-probes.ts` | Re-records the cart-route probe for the demo stores |
| `scripts/cache-images.ts` | Saves the demo's three images so recorded mode needs no network at all |
| `scripts/ucp.mjs` | A small UCP client used for the verification run |

## Layout

- `server/`: the Node server, the check, and one module per job (`catalog`, `cart`, `ask`, `policy`, `extract`, `reconcile`, `cost`, `handoff`)
- `server/ucp/`: the data layer, with live, recorded, recording and fault-injecting transports
- `src/`: the page, a scripted assistant thread and the card
- `shared/`: the card model both sides use
- `fixtures/`: recorded Shopify responses, saved model reads, and the generalization run
- `docs/`: the spec, the verification notes and the demo script

## What I'd want a reviewer to know

- **It's a bet.** Nothing published shows that a swatch leads to the sofa purchase. The test I'd run is to show the card or not, and measure sample orders and purchases.
- **Coverage is thinnest where doubt is highest.** Two of three extra stores quoted no delivery for a ZIP, and one has no return terms on its policy page (`docs/verification.md`, section 10).
- **The model can still misread.** The quote and arithmetic checks catch a lot, and the card fails closed when they trip, but extraction isn't perfect. Section 10 lists every error I found by reading the policies myself.
- **Temperature 0 isn't possible** on current Claude models, so repeatability comes from the strict schema and the saved reads.
- **The door price is a cart estimate.** Final shipping and tax come at checkout.
