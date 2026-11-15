# Before You Buy: design spec

- Date: 2026-11-15
- Status: approved direction, ready for verification and an implementation plan
- Supersedes: `2026-11-14-room-planner-design.md` (kept for history; its verified Catalog findings are carried into section 10)
- Audience: the Claude Code session that will verify, plan and build the prototype
- Owner: Aryan Mudgal

## 1. Context

Take-home assignment for Shopify. Deliverables:

1. A working code prototype. It must communicate the idea clearly. It does not need to be complete or polished.
2. A screen-recorded demo of 3 minutes or less covering problem, solution and reflection.
3. A Markdown export of every AI chat session used, one file per session, zipped if more than one.

Hard requirements from the brief:

- Persona: first-time renters or home buyers furnishing a home.
- Must use the Shopify Catalog API and the Universal Commerce Protocol (UCP).
- A focused experience is preferred over a complete shopping app.
- Reviewers penalise generic one-shot output. Build in stages and review each stage.

## 2. Problem

A first-time renter, shopping through an AI assistant, has found their first big piece of furniture (a sofa or bed, roughly $800 to $1,500) from a store they have never bought from. They see one price. The decision turns on things they cannot see:

1. What it will really cost at their door.
2. Whether there is a cheaper way to find out if it is right before committing (a sample or a showroom).
3. What it costs if they are wrong.
4. Whether it fits their room.

With those hidden, the choice collapses to "risk the whole amount" or "walk away."

Out of scope on purpose: choosing products, styling and colour palettes, delivery dates, store reputation beyond the listing filter in 10.3, payment.

### 2.1 Evidence

Published:

- Morning Consult found nearly 40% of consumers dropped an intended home furnishings purchase, citing affordability and style uncertainty, and found that getting into a store helped indecisive shoppers buy.
- A Happy Returns report for PayPal (2023) found 81% of US digital shoppers review return policies before a first-time purchase. Loop (2026) found 58% check often or always.
- Reading a policy is not knowing the cost. An Ada survey found unexpected return fees were the top returns pain point (42%). A LegalShield survey found 15% of those who attempted returns were hit with unexpected restocking or shipping fees.
- A meta-analysis of 21 papers (Janakiraman, Syrdal and Freling, Journal of Retailing, 2016) found return leniency increases purchase more than return, and that money and effort leniency are the dimensions that increase purchase.
- Baymard's furniture research names confidence in size and fit as a core challenge.

From the owner's own live probes on 2026-11-14 (unpublished, small samples):

- The price at the door in a cart ran from 15% below to 40% above the Catalog price. Verify these compared the same variant (see 11, item 7).
- All 40 sampled stores answered a return question. Answers ranged from free to 84% of the price, to no returns at all.
- A sample product existed at 17 of 22 well-known brands and about 15% of generic sellers. A showroom near Brooklyn existed for 5 of 22. Delivery was quoted in the cart for 12 of 22.

Assumption, stated as such in the video: first-timers do not know these questions exist. Experienced buyers know to order swatches and check restocking fees and return freight. This comes from the owner's ChatGPT test, where each useful answer appeared only after he asked for it.

## 3. Vision and framing

The product is a check that runs inside a shopping agent, after the agent has found a product and before it hands the buyer to checkout. It is not a destination website.

The prototype simulates that surface: a minimal assistant conversation in which the check appears as a card. The video opens with the line: "Agents find the product. This is the check before you pay."

Supporting signal: Shopify already exposes storefront tools to agents running in the shopper's browser (WebMCP), including `ask_business`. The same check could run there.

## 4. Principles

Each principle is a requirement. A build that drops one has drifted from the design.

1. **Answers first.** The card appears as soon as the product is known. There is no intake questionnaire.
2. **Ask only what is needed, when it is needed.** ZIP code first, because price, return freight and showrooms depend on it. Floor plan only when the buyer asks "Will it fit?"
3. **Show the work.** Every value names its source and the step that produced it, for example "Priced in a cart for 14228."
4. **Quote the store.** Any figure derived from the store's answer is shown next to the store's own words.
5. **Say when something is missing.** "This store lists no sample or showroom." Empty rows are shown, never hidden.
6. **No score, no verdict.** Two equal actions. The buyer decides.
7. **No invented numbers.** The model never states a price, fee, percentage or size that is not in the data. Code does all arithmetic.
8. **Label estimates.** Cart totals, extracted terms and inferred sizes carry a label saying what they are.

## 5. Scope

In scope:

- One product per check. Demo on sofas.
- Entry by a product the assistant recommended, or a pasted product URL.
- ZIP code entry.
- The card with three rows plus a "Will it fit?" panel.
- Two actions: order the sample, or buy the piece. Both hand off to the store's checkout.
- Optional: a follow-up question box answered by the store (stage 6).
- Desktop browser, single page.

Out of scope:

- Product discovery and recommendation.
- Colour palettes and styling.
- Multi-item rooms.
- Comparing the same piece across stores (Reflection only).
- Payment inside the app, order tracking, delivery dates.

## 6. User flow

### 6.1 Entry

A minimal assistant thread, styled neutrally so it reads as "any assistant," not a copy of a specific product.

- Path A: the thread opens with an assistant message recommending a sofa, shown as a product card with a "Check before you buy" button.
- Path B: the buyer pastes a product URL into the input.

Both paths lead to the same check.

### 6.2 ZIP code

If no ZIP is known, the assistant asks one line: "What ZIP will this be delivered to?" The answer is stored for the session. The ZIP is entered by the buyer, so it may be used as the search centre for showrooms.

### 6.3 The card

Header: photo, title, chosen variant (fabric, colour, size), seller name, rating with count, listed price.

Rows:

| Row | Shows | Source label |
|---|---|---|
| To buy | Estimated price at the door before tax (item plus delivery), next to the listed price | "Cart estimate for {ZIP}" |
| To find out first | Sample with its price (often $0) and the matching fabric; nearest showroom with name and distance | "Store catalog" / "Store locations" |
| If you're wrong | What you lose if you return it: by condition (with box, without box), within the window, plus return shipping and non-refunded delivery | "The store's answer" with the quoted text and a link to the refund policy |

Below the rows:

- "Will it fit?" button that opens the fit panel (6.4).
- A "How I checked" strip, collapsed by default, listing each step: product identified, cart priced, catalog searched for a sample, locations searched, store asked about returns. Each step shows what came back.

Empty and partial states:

- No sample and no showroom: "This store lists no sample or showroom. The return terms are your way back."
- Return shipping not stated: "+ return shipping, amount not stated by the store."
- Store answer unavailable: fall back to the refund policy page (see 7.6) and label it "From the store's policy page."
- No returns: "This store does not accept returns on this item." with the quote.

Illustrative values, from the owner's probe of a Burrow sofa for a Chicago ZIP:

| Row | Value |
|---|---|
| To buy | $1,217 listed, $1,286 at the door before tax |
| To find out first | $0 swatch in that exact fabric, or a showroom 1.0 mile away |
| If you're wrong | $121.70 with the box, $243.40 without, within 30 days of delivery |

### 6.4 Fit panel

1. The buyer uploads a floor plan image or enters the room's length and width.
2. The model reads the room dimensions from the image. The assistant states what it read ("I read your living room as 11 ft by 14 ft") and the buyer confirms or corrects. The confirm step is required.
3. The panel draws the room top-down, to scale, with the item placed against the longest wall without a door.
4. The item's width and depth show their source: "from the title," "from the store's answer," or "size not stated by the seller" (drawn dashed at a category default).
5. A dimension line shows walkway clearance where it is under 30 inches.

### 6.5 Actions

Two buttons of equal weight:

- "Order the sample ($X)": creates a cart at the store with the sample variant, then hands off to the store's checkout.
- "Buy it": hands off to the store's checkout for the piece.

If no sample exists, only "Buy it" appears, with the "If you're wrong" row kept in view.

### 6.6 Follow-up questions (optional, stage 6)

The buyer can type a question, such as "Can I return it if I've removed the legs?" The app forwards it to the store's `ask_business` with the product ID and ZIP, and shows the store's answer quoted, labelled "The store's answer."

## 7. Data sources and calls

All storefront calls go to the store's own UCP endpoint, `https://{store-domain}/api/ucp/mcp`. Every request includes `meta.ucp-agent.profile`. Verify exact field names against the docs and the verification run (section 11) before coding.

### 7.1 Agent profile

- UCP version 2026-08-25. Ask and location tools are not available on earlier versions.
- Declare, at minimum: `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup`, `dev.shopify.catalog`, `dev.shopify.catalog.global`, the cart capability, `dev.ucp.common.ask`, `dev.ucp.common.location.search`, `dev.ucp.common.location.lookup`.
- Base capabilities unlock tools. Extensions unlock Shopify's enriched fields. An extension without its base capability is pruned.
- The dashboard profile used on 2026-11-14 was at `2026-04-08` and is not enough. First check whether Shopify hosts a 2026-08-25 example profile that declares ask and location. If not, host our own profile at a public HTTPS URL so stores can fetch it.
- Use `tools/list` on each store to see which tools it offers for this profile.

### 7.2 Identify the product

- Global Catalog `lookup_catalog` with the pasted product URL. Shopify announced URL lookup for Catalog; confirm the parameter name.
- Fallback: `search_catalog` with the product title from the page.
- Keep: product, the selected variant, `seller.domain`, `seller.url`, `seller.links`, `checkout_url`.
- Variant IDs in Global Catalog responses are store-native (`gid://shopify/ProductVariant/...`), so they can be passed to the store's cart and ask tools.

### 7.3 Price at the door

- Cart MCP `create_cart` at the store endpoint with the variant, quantity 1, and context `address_country`, `address_region`, `postal_code`.
- Read the estimated totals: item subtotal, delivery or shipping estimate, total before tax.
- Call `cancel_cart` afterwards, so the check does not leave carts open.
- Label as an estimate. Authoritative shipping comes from checkout.
- Confirm the cart priced the same variant as the Catalog result. Show a mismatch as an error, not as a hidden cost.

### 7.4 Sample

- Storefront Catalog `search_catalog` on the store with queries such as "swatch", "sample", and "{fabric name} swatch".
- Swatches are ordinary products. The model matches a result to the selected variant's fabric or colour option, and returns the matching product and variant IDs plus the option label it matched on. Code checks the IDs exist in the search results.
- If no match: show the row as empty.

### 7.5 Showroom

- Storefront Catalog `search_locations` on the store, only when the store's profile lists the location capability.
- `distance.center` from the buyer's ZIP. Use a bundled ZIP centroid table (US Census ZCTA gazetteer) or hard-code the demo ZIPs. Max radius 40 km.
- Optionally pass `filters.items` with the variant ID. Availability is not a stock count or a display promise. Label: "Stock at this location not confirmed."
- Show the nearest location's name and distance.

### 7.6 Return cost

Primary: Ask MCP `ask_business` on the store.

- `ask.query`: "If I return this item after delivery to {ZIP}, what will I pay? Include any restocking fee and whether it depends on packaging, who pays return shipping and how much, whether original delivery charges are refunded, the return window and when it starts, and whether this item is final sale."
- `ask.ids`: the variant ID.
- `ask.context`: `address_country`, `address_region`, `postal_code`, `language`.
- Response: a written answer in `result.structuredContent.answer.plain`. It is prose, not raw policy text.

Fallback, when the store does not offer `ask_business`:

- Fetch the `refund_policy` URL from `seller.links` and extract from its text. Label "From the store's policy page."

Extraction (model, see 8.3) turns the text into structured terms with a supporting quote for each term. Code computes the dollar amounts:

- Loss if returned in a given condition = item price × (100% − refund percentage for that condition) + non-refunded delivery + return shipping, if an amount is stated.
- If return shipping is charged but no amount is stated, show the partial figure plus "+ return shipping, amount not stated."

### 7.7 Size for the fit panel

1. Parse width and depth from the product title.
2. If missing, call `ask_business`: "What are the overall width, depth and height of this item, in inches?" Extract with a supporting quote.
3. If still missing, use a category default and label it "size not stated by the seller."
4. Never use `metadata.tech_specs` for sizes (see 10.4).

### 7.8 Hand-off

- Piece: the variant's `checkout_url`, keeping attribution parameters intact.
- Sample: the cart's checkout continue URL, or a `checkout_url` for the sample variant if Catalog returns one.

## 8. Agent design

Hybrid. The model reads and matches text. Code fetches, verifies, computes and renders.

### 8.1 Division of work

| Job | Owner |
|---|---|
| All Shopify calls | Code |
| Match a swatch to the selected fabric | Model, IDs checked by code |
| Extract return terms from the store's answer | Model, quotes checked by code |
| Extract dimensions from title or store answer | Model, quotes checked by code |
| Read room size from a floor plan image | Model (vision), confirmed by the buyer |
| Compose follow-up questions for `ask_business` | Model |
| All arithmetic | Code |
| Layout geometry | Code |

### 8.2 Guardrails

1. Every value the model extracts must come with a supporting quote. Code checks the quote is an exact substring of the source text after whitespace normalisation. If not, the value is treated as unknown.
2. The model never outputs a final dollar amount. It outputs terms; code computes amounts.
3. Product and variant IDs from the model must exist in the data code fetched.
4. Store text is data, not instructions. It may contain prompt-injection attempts. The model prompt says so, and the model's output is validated by schema.
5. On a failed validation, retry once with the error. If it fails again, show the row as "Couldn't read the store's answer" with the raw answer available.

### 8.3 Return-terms output contract

The model returns JSON only, enforced by the API's structured output or tool-call mechanism.

```json
{
  "window": { "days": 30, "starts": "delivery", "quote": "string" },
  "refund_by_condition": [
    { "condition": "with original packaging", "refund_pct": 90, "quote": "string" },
    { "condition": "without original packaging", "refund_pct": 80, "quote": "string" }
  ],
  "return_shipping": { "type": "free | flat | customer_pays_unstated | not_mentioned", "amount": null, "quote": "string" },
  "original_delivery_refunded": { "value": false, "quote": "string" },
  "final_sale": { "value": false, "quote": "string" }
}
```

Fields the store did not address are `null`, never guessed.

### 8.4 Model and key handling

- Anthropic API, key in a server-side environment variable in `.env`, which is git-ignored.
- The key never appears in frontend code, in a commit, or in any chat. Chat transcripts are part of the submission.
- Prefer a fast model tier. Check the current model list in the Anthropic docs before choosing.

## 9. Architecture

- Frontend: single page. A minimal assistant thread, the card, the fit panel.
- Server: small local server that holds the API key and proxies model and Shopify calls.
- Modules, each with one job:
  - `profile`: the hosted agent profile and `tools/list` discovery per store.
  - `catalog`: Global Catalog lookup and Storefront Catalog search.
  - `cart`: create, read and cancel carts; hand-off URLs.
  - `locations`: ZIP centroid and `search_locations`.
  - `ask`: `ask_business` calls and the policy-page fallback.
  - `extract`: model calls with schema validation and quote checks.
  - `cost`: pure functions that turn terms and prices into dollar amounts.
  - `fit`: room geometry and SVG.
  - `ui`: thread, card, panel, empty states, "How I checked" strip.
- `cost` and `fit` are pure functions with unit tests.

Data modes behind one interface:

1. `live`: real calls.
2. `recorded`: responses saved from the verification run. Default for recording the video, so a network failure cannot break the take.
3. `mock`: hand-written data in the real response shapes, used only if access fails.

Show the active mode in a small footer label.

## 10. Verified facts carried over from 2026-11-14

### 10.1 Saved catalog in the Dev Dashboard

- Source: All products, Shopify only. Off-Shopify (beta) unchecked.
- Buyer country and Ships to: United States. Ships from: Anywhere.
- Prefix empty. Categories and colour open. Saved settings override request parameters.

### 10.2 Global Catalog request that worked

```bash
curl -X POST "https://catalog.shopify.com/api/ucp/mcp" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-03-26" \
  -H "Accept: application/json" \
  -d '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "search_catalog",
    "arguments": {
      "meta": { "ucp-agent": { "profile": "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json" } },
      "catalog": { "query": "3 seat sofa", "pagination": { "limit": 10 }, "filters": { "available": true } }
    }
  }
}'
```

- No `Authorization` header. Search worked with the agent profile alone, from the dashboard. Confirm from a terminal.

### 10.3 Response shape and listing filter

- Path: `result.structuredContent.products[]`.
- Product: `id` (`gid://shopify/p/...`), `title`, `description.plain`, `handle`, `rating` (`value`, `scale_min`, `scale_max`, `count`), `media[]`, `options[]`, `metadata`, `variants[]`, `price_range`.
- Variant: `id` (`gid://shopify/ProductVariant/...`), `price` and `list_price` (minor units), `availability.available`, `options[]`, `seller`, `checkout_url`, `rating`, `condition`, `eligible.native_checkout`.
- `seller`: `name`, `url` (storefront), `domain` (`*.myshopify.com`), `links[]` with `privacy_policy`, `terms_of_service`, `refund_policy`, `shipping_policy`.
- Search returns one representative variant per product. Use `get_product` with `selected` for another option.
- `eligible.native_checkout` was `false` for the sampled merchant. Plan on hand-off for every purchase.
- Listing filter: drop any product with no `checkout_url` or fewer than 10 ratings, whenever the app itself surfaces a product (for example the seeded recommendation in 6.1, or a future cross-store comparison). Never drop the product the buyer brought: check it anyway and show its rating count as it is. In testing, "Similar" surfaced three stores selling one table with the same photo at about 15 times the price, with no rating and no checkout link.

### 10.4 Data quality

- `description.plain` contains HTML and sometimes raw CSS. Strip before display and before sending to the model.
- `metadata.tech_specs` contradicted a seller's own text (leg diameter in cm vs in, four sizes vs three). Never render inferred metadata as fact.
- Sizes appeared in sofa and rug titles, rarely in coffee table titles.

## 11. Verification run (first task, before any UI)

Time box: 45 minutes. If ask or location tools cannot be reached in that time, continue with the fallbacks in 7.6 and an empty showroom row, and note it for the Reflection.

Stores:

- A: a well-known brand with swatches and showrooms. The owner's probes used Burrow.
- B: a generic seller from the dashboard tests, such as Garvee.

Steps, for each store:

1. Build or find a 2026-08-25 agent profile declaring the capabilities in 7.1. Host it if needed.
2. `tools/list` on the store endpoint. Record which tools appear.
3. Global Catalog `lookup_catalog` by product URL for one sofa. Record the variant ID and seller fields.
4. `create_cart` with a demo ZIP. Record totals and the variant priced. Then `cancel_cart`.
5. Storefront `search_catalog` for "swatch". Record results and whether one matches the sofa's fabric.
6. `search_locations` near the demo ZIP, if offered.
7. Compare the cart's variant and price with the Catalog's. Record whether any difference is a hidden cost or a variant mismatch.
8. `ask_business` with the return question in 7.6. Save the full answer.
9. `ask_business` with the dimensions question in 7.7.
10. Save every response as a fixture for the `recorded` mode.

Pass criteria: store A returns usable values for all three rows. Store B may return empty rows; that is the second demo case.

Then choose the demo ZIPs: one where store A has a showroom within 40 km, and the owner's Buffalo ZIP (14228) for comparison if it differs.

## 12. Build stages

Stop for the owner's review after each stage.

1. **Verification and fixtures** (section 11).
2. **Card shell on fixtures.** Thread, card, three rows, empty states, "How I checked" strip, two actions.
3. **Live calls** behind the data layer: lookup, cart, sample search, locations, ask, with fallbacks.
4. **Extraction and cost.** Model extraction with quote checks; `cost` arithmetic with unit tests.
5. **Fit panel.** Floor plan reading with confirmation; to-scale drawing; size labels.
6. **Actions and follow-up.** Sample cart hand-off, buy hand-off; optional follow-up question box.
7. **Demo polish.** Timing, recorded mode, rehearsal against three minutes.

## 13. Demo path and video outline

- **0:00 to 0:30, problem.** An assistant has found a sofa. One price shows; the hidden costs don't. One statistic. The vision line.
- **0:30 to 1:40, store A.** Paste or tap check. ZIP. The card fills: door price, $0 swatch and nearby showroom, cost if wrong with the store's words. Open "How I checked." Tap "Will it fit?", confirm the room size, see the sofa to scale. Tap "Order the sample."
- **1:40 to 2:10, store B.** Same check on a generic seller. No sample, no showroom, harsher return terms, all stated plainly.
- **2:10 to 3:00, reflection.** See section 14.

## 14. Reflection notes

Weakest parts:

- It is a bet. No published evidence shows a swatch leads to the sofa purchase. Warby Parker and Amazon ended home try-on in 2025, for cost and store-coverage reasons, not proven failure. The return-leniency meta-analysis supports the "if you're wrong" row. The test to run: show the card or not, and measure sample orders and purchases.
- Coverage is uneven and thinnest at generic sellers, where doubt is highest.
- `ask_business` returns prose. Extraction can err. The quote check limits this but does not remove it.
- The door price is a cart estimate. Authoritative shipping and tax come at checkout.
- Product dimensions are sparse in Catalog.
- The prototype simulates the agent surface. The real home is inside an assistant or the shopper's browser.

Merchant question: the card favours stores with lenient terms. The meta-analysis suggests clear, lenient terms raise purchases, so it rewards merchants who offer a safe way back.

Next:

- Run the check inside an agent, through UCP or WebMCP, as the step before checkout.
- Compare the same piece across stores on the same three rows. The owner's probes found 35% of sampled pieces sold by several stores, and the cheapest listing was never the one with the best way back.
- Structured dimensions in Catalog would make the fit panel reliable.

## 15. References

- Shopify agentic commerce docs: https://shopify.dev/docs/agents
- Global Catalog MCP: https://shopify.dev/docs/agents/catalog/global-catalog
- Storefront Catalog MCP, including location tools: https://shopify.dev/docs/agents/catalog/storefront-catalog
- UCP location search and lookup: https://shopify.dev/changelog/posts/discover-a-merchant-s-retail-stores-with-ucp-location-search-and-lookup
- Ask MCP: https://shopify.dev/docs/agents/ask
- Policy tool deprecated in favour of Ask MCP: https://shopify.dev/changelog/posts/storefront-mcp-policies-and-faqs-tool-is-being-deprecated-in-favor-of-ucp-mcp-ask-tool
- Migrate from Storefront MCP: https://shopify.dev/docs/apps/build/storefront-mcp
- Cart MCP: https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
- Checkout MCP: https://shopify.dev/docs/agents/carts-and-checkout/checkout-mcp
- WebMCP storefront tools: https://shopify.dev/docs/api/web-mcp
- About Catalogs, usage and caching rules: https://shopify.dev/docs/agents/catalog
- UCP specification: https://ucp.dev
- Morning Consult, purchase abandonment: https://pro.morningconsult.com/analyst-reports/consumer-purchase-abandonment
- Return policy leniency meta-analysis: https://econpapers.repec.org/RePEc:eee:jouret:v:92:y:2016:i:2:p:226-235
- Baymard furniture research: https://baymard.com/research-articles/furniture-and-home-decor-quantitative-ux-insights-2026
