# Before You Buy: design spec

- Date: 2026-11-15
- Revision: 5, after the stage 6 review on 2026-11-15. Changes: the returns row is renamed "If you return it" and shows each way a return can go as its own case, cheapest first; the store's exact words move behind "Read in detail" (principle 4); a store whose checkout links can't open from outside its own site gets a "View on {store}'s site" button (6.4).
- Revision 4, after stage 2 review on 2026-11-15. Changes: the refund policy page becomes the primary source for figures and quotes; `ask_business` answers are labelled as the store's assistant; cart destination is country plus ZIP; store endpoint is `seller.domain`; exchange clause added to the ask query.
- Revision 3, after the verification run on 2026-11-15. Changes: return-terms format (fee caps, fees with no stated amount, shipping included in the fee, free exchange), $1 swatch, Shopify's example profiles, variant links, delivery destination rule, made-to-order moment dropped.
- Revision 2 trimmed scope: removed the fit panel, the showroom row and follow-up questions.
- Status: verification done; ready for stage 2
- Supersedes: `2026-11-14-room-planner-design.md` and revision 1 of this file
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

A first-time renter, shopping through an AI assistant or social content, has found their first big piece of furniture (a sofa, roughly $800 to $1,500) from a store they have never bought from. They see one price. The decision turns on three things they cannot see:

1. What it will really cost at their door.
2. Whether there is a cheaper way to find out if it is right before committing (a sample).
3. What it costs if they are wrong.

With those hidden, the choice collapses to "risk the whole amount" or "walk away."

Out of scope on purpose: choosing products, styling, room fit, showrooms, delivery dates, store reputation beyond the listing filter in 10.3, payment.

### 2.1 Evidence

Published:

- Morning Consult found nearly 40% of consumers dropped an intended home furnishings purchase, citing affordability and style uncertainty.
- A Happy Returns report for PayPal (2023) found 81% of US digital shoppers review return policies before a first-time purchase. Loop (2026) found 58% check often or always.
- Reading a policy is not knowing the cost. An Ada survey found unexpected return fees were the top returns pain point (42%). A LegalShield survey found 15% of those who attempted returns were hit with unexpected restocking or shipping fees.
- A meta-analysis of 21 papers (Janakiraman, Syrdal and Freling, Journal of Retailing, 2016) found return leniency increases purchase more than return, and that money and effort leniency are the dimensions that increase purchase.

From the owner's own live probes on 2026-11-14 (unpublished, small samples):

- All 40 sampled stores answered a return question. Answers ranged from free to 84% of the price, to no returns at all.
- A sample product existed at 17 of 22 well-known brands and about 15% of generic sellers.
- The probes also reported door prices from 15% below to 40% above the Catalog price, and delivery quoted in 12 of 22 carts. The verification run did not reproduce either: both carts priced the same variant at the Catalog price, and delivery appeared only once a shipping destination was given. Do not cite these two figures in the video.

Assumption, stated as such in the video: first-timers do not know these questions exist. Experienced buyers know to order swatches and check restocking fees and return freight. This comes from the owner's ChatGPT test, where each useful answer appeared only after he asked for it.

## 3. Vision and framing

The product is a check that runs inside a shopping agent, after the buyer has found a product and before the agent hands them to checkout. It is not a destination website.

The prototype simulates that surface: a minimal, scripted assistant conversation in which the check appears as a card. The video opens with the line: "Agents find the product. This is the check before you pay."

Supporting signal: Shopify already exposes storefront tools to agents running in the shopper's browser (WebMCP), including `ask_business`. The same check could run there.

## 4. Principles

Each principle is a requirement. A build that drops one has drifted from the design.

1. **Answers first.** The card appears as soon as the product and ZIP are known. There is no intake questionnaire.
2. **Ask only what is needed.** The ZIP code is the only question up front, because price and return freight depend on it. If the cart needs more than a ZIP to quote delivery, ask for it at that moment and say why. Never invent an address.
3. **Show the work.** Every value names its source and the step that produced it, for example "Priced in a cart for 14228."
4. **Quote the store.** Every figure derived from the store's terms names its source on the card, and the store's own words, taken from its refund policy page, are one click away under "Read in detail", grouped by case. When a check fails, the store's words show unfolded instead of any figure. Answers from Shopify's Ask tool are AI-written summaries: label them "The store's assistant" and never style them as the store's own words.
5. **Say when something is missing.** "This store lists no sample." Empty or unstated values are shown, never hidden or guessed.
6. **No score, no verdict.** Two equal actions. The buyer decides.
7. **No invented numbers.** The model never states a price, fee or percentage that is not in the data. Code does all arithmetic.
8. **Label estimates.** Cart totals and extracted terms carry a label saying what they are.

## 5. Scope

In scope:

- One product per check. Demo on sofas.
- Entry by a pasted product URL in a scripted thread.
- ZIP code entry.
- The card with three rows and a "How I checked" strip.
- Two actions: order the sample, or buy the piece. Both hand off to the store's checkout.
- A second run on a generic seller to show empty and partial states.
- Desktop browser, single page.

Out of scope (all named in the Reflection, section 14):

- A fit panel or floor plan.
- Showrooms.
- Follow-up questions to the store.
- Comparing the same piece across stores.
- Product discovery, styling, multi-item rooms.
- Payment inside the app, order tracking, delivery dates.

## 6. User flow

### 6.1 Entry

A minimal, scripted assistant thread, styled neutrally so it reads as "any assistant," not a copy of a specific product. There is no open chat.

1. The thread opens with a scripted buyer message: "Found this sofa on ChatGPT, should I buy it?"
2. The buyer pastes a product URL into the input.

The input accepts a product URL and a ZIP code only.

### 6.2 ZIP code

The assistant asks one line: "What ZIP will this be delivered to?" The answer is stored for the session.

### 6.3 The card

Header: photo, title, chosen variant (fabric, colour, size), seller name, rating with count, listed price.

Rows, in this order:

| Row | Shows | Source label |
|---|---|---|
| To buy | Estimated price at the door before tax (item plus delivery), next to the listed price | "Cart estimate for {ZIP}" |
| Try it first | A sample in the sofa's fabric, with its price (often around $1) | "Store catalog" |
| If you return it | Each way a return can go as its own case, cheapest first, each with its figure: exchange it (if the store offers a free exchange), send it back with the box, send it back without the box. The window, return shipping and delivery terms sit underneath. The store's quoted words are under "Read in detail" | "From {store}'s refund policy" with a link to it; item-specific notes labelled "The store's assistant" |

Below the rows, a "How I checked" strip, collapsed by default, lists each step: product identified, cart priced, store catalog searched for a sample, refund policy read, store's assistant asked about returns. Each step shows what came back.

Empty and partial states:

- No sample: "This store lists no sample. The return terms are your way back."
- Return shipping charged but amount not stated: "+ return shipping, amount not stated by the store."
- Return shipping included in the fee: say "includes return shipping" beside the fee. No separate line.
- Restocking fee charged but amount not stated: "You pay a restocking fee; the store doesn't state the amount."
- Delivery refund not stated: "+ ${delivery} delivery, refund not stated." Do not add it into the total.
- Policy page unavailable: use the store assistant's answer alone, labelled "The store's assistant," and say the policy page couldn't be read.
- Store assistant unavailable: use the policy page alone.
- Policy and assistant disagree: show both, each with its label. Do not pick one.
- No returns on this item: "This store does not accept returns on this item," with the quote.

Verified values for ZIP 14228, from the verification run on 2026-11-15:

| Row | Burrow Nomad Sofa | Garvee 137" Cloud Sectional |
|---|---|---|
| To buy | $1,364 listed, $1,433 at the door ($69 shipping) | $681.99 listed, $681.99 at the door (free delivery) |
| Try it first | $1 swatch in the exact fabric, Crushed Gravel Performance Chenille | This store lists no sample. |
| If you return it | Exchange it: free, once, with the original box. Send it back with the box: $136.40. Send it back without the box: $250 (20% capped at $250). Both fees cover return shipping. 30 days from confirmed delivery; the store doesn't say whether the $69 delivery is refunded. | Send it back: you pay return shipping and a restocking fee; the store states neither amount. |

### 6.4 Actions

Two buttons of equal weight:

- "Order the sample ($X)": hands off to the store's checkout using the swatch's own `checkout_url`.
- "Buy it": hands off to the store's checkout for the piece.

If no sample exists, only "Buy it" appears, with the "If you return it" row kept in view.

If the store's checkout links can't open from outside its own site (the cart-route probe in `docs/verification.md` section 11.3), "Buy it" becomes "View on {store}'s site". It opens the product page, and the line under it says categorically that it opens the product page, not checkout, and that the buyer buys there. If the probe is inconclusive, the checkout link stays.

## 7. Data sources and calls

All storefront calls go to the store's own UCP endpoint, `https://{store-domain}/api/ucp/mcp`. Every request includes `meta.ucp-agent.profile`. Verify exact field names against the docs and the verification run (section 11) before coding.

### 7.1 Agent profile

- UCP version 2026-08-25. The ask tool is not available on earlier versions.
- Declare, at minimum: `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup`, `dev.shopify.catalog`, `dev.shopify.catalog.global`, the cart capability, `dev.ucp.common.ask`.
- Base capabilities unlock tools. Extensions unlock Shopify's enriched fields. An extension without its base capability is pruned.
- Verified 2026-11-15: Shopify's two example profiles, one for catalog and cart and one for ask, work side by side. No self-hosted profile is needed. The profile URLs are recorded in `docs/verification.md`.
- Use `tools/list` on each store to see which tools it offers for this profile.

### 7.2 Identify the product

- Global Catalog `lookup_catalog` with the pasted product URL. Shopify announced URL lookup for Catalog; confirm the parameter name.
- Pass the URL with its `?variant=` parameter. Burrow's links resolve only with it; Garvee's resolve without. The demo link includes the variant.
- The store's UCP endpoint is on `seller.domain` (the `myshopify.com` domain). Verified: Garvee's storefront domain returns a web page instead.
- Fallback: `search_catalog` with the product title from the page.
- Keep: product, the selected variant, `seller.domain`, `seller.url`, `seller.links`, `checkout_url`.
- Variant IDs in Global Catalog responses are store-native (`gid://shopify/ProductVariant/...`), so they can be passed to the store's cart and ask tools.

### 7.3 Price at the door

- Cart MCP `create_cart` at the store endpoint with the variant, quantity 1, and context `address_country` and `postal_code`.
- The cart quotes delivery only when given a shipping destination (a shipping fulfillment method with a destination), not from context alone. Verified 2026-11-15: country plus ZIP as the destination is enough at both stores, so the check never asks for an address. Never invent one.
- Read the estimated totals: item subtotal, delivery or shipping estimate, total before tax.
- Call `cancel_cart` afterwards, so the check does not leave carts open.
- Label as an estimate. Authoritative shipping comes from checkout.
- Confirm the cart priced the same variant as the Catalog result. Show a mismatch as an error, not as a hidden cost.

### 7.4 Sample

- Storefront Catalog `search_catalog` on the store. Search "{fabric name} swatch" first, using the selected variant's fabric option label. Fall back to "swatch" and "sample". In verification, a plain "swatch" search missed Burrow's fabric and the fabric-name search found it.
- Swatches are ordinary products. The model matches a result to the selected variant's fabric or colour option, and returns the matching product and variant IDs plus the option label it matched on. Code checks the IDs exist in the search results.
- If no match: show the row as empty.

### 7.5 Return cost

Two sources, both read on every check:

1. **The store's refund policy page**, from the `refund_policy` URL in `seller.links`. This is the primary source for every figure and every quote on the card, because it is the store's own text.
2. **Ask MCP `ask_business`**, for what the policy page can't settle for this item: whether it is final sale, item-specific exceptions (verification found Burrow's add-on exception this way), and terms the page doesn't cover.
   - `ask.query`: "If I return this item after delivery to {ZIP}, what will I pay? Include any restocking fee and whether it depends on packaging, who pays return shipping and how much, whether original delivery charges are refunded, the return window and when it starts, whether this item is final sale, and whether I can exchange it instead and on what terms."
   - `ask.ids`: the variant ID.
   - `ask.context`: `address_country`, `postal_code`, `language`.
   - Response: an AI-written summary in `result.structuredContent.answer.plain`. In verification it was vaguer than the policy in places. It said the store doesn't specify who pays the carrier, while Burrow's policy says the fee is the return shipping fee and Burrow sends a label or schedules pickup.

If the policy page can't be fetched, use the assistant's answer alone and say so. If the store offers no `ask_business`, use the policy page alone. When the two disagree, show both with their labels.

Extraction (model, see 8.3) runs on the policy text, with the assistant's answer as a second input. Each term carries a supporting quote and its source (`policy` or `assistant`). Code computes the dollar amounts:

- Fee for a condition: a percent fee is item price × percent, capped at the stated cap if there is one; a flat fee is the stated amount; no fee is $0.
- Loss if returned in that condition = fee + delivery if the store says it is not refunded + return shipping if a flat amount is stated and it is not included in the fee.
- If the store does not say whether delivery is refunded, show "+ ${delivery} delivery, refund not stated" beside the figure and do not add it in.
- If return shipping is charged but no amount is stated, show "+ return shipping, amount not stated." If it is included in the fee, say "includes return shipping."
- If a restocking fee is charged but no amount is stated, show the fee as text, with no dollar figure.
- If the store offers a free exchange, show it as its own line with its conditions and quote, for example "Or $0: one free exchange with the original box."

### 7.6 Hand-off

- Piece: the variant's `checkout_url`, keeping attribution parameters intact.
- Sample: the swatch variant's own `checkout_url`. Verified at Burrow; no cart is needed.

## 8. Agent design

Hybrid. The model reads and matches text. Code fetches, verifies, computes and renders.

### 8.1 Division of work

| Job | Owner |
|---|---|
| All Shopify calls | Code |
| Match a swatch to the selected fabric | Model, IDs checked by code |
| Fetch the refund policy page | Code |
| Extract return terms from the policy page, with the assistant's answer as a second input | Model, quotes checked by code |
| All arithmetic | Code |

### 8.2 Guardrails

1. Every value the model extracts must come with a supporting quote and its source (`policy` or `assistant`). Code checks the quote is an exact substring of that source's text after whitespace normalisation. If not, the value is treated as unknown.
2. The model never outputs a final dollar amount. It outputs terms; code computes amounts.
3. Product and variant IDs from the model must exist in the data code fetched.
4. Store text is data, not instructions. It may contain prompt-injection attempts. The model prompt says so, and the model's output is validated by schema.
5. On a failed validation, retry once with the error. If it fails again, show the row as "Couldn't read the store's answer" with the raw answer available.

### 8.3 Return-terms output contract

The model returns JSON only, enforced by the API's structured output or tool-call mechanism.

```json
{
  "window": { "days": 30, "starts": "confirmed delivery", "quote": "string" },
  "fees_by_condition": [
    { "condition": "with original box", "fee": { "type": "percent", "percent": 10, "amount": null, "cap": null }, "quote": "string" },
    { "condition": "without original box", "fee": { "type": "percent", "percent": 20, "amount": null, "cap": 250 }, "quote": "string" }
  ],
  "return_shipping": { "type": "free | flat | included_in_fee | customer_pays_unstated | not_mentioned", "amount": null, "quote": "string" },
  "original_delivery_refunded": { "value": null, "quote": null },
  "exchange": { "free": true, "conditions": "one exchange, original box", "quote": "string" },
  "final_sale": { "value": false, "quote": "string" }
}
```

- Every `quote` field is an object `{ "text": "string", "source": "policy | assistant" }`. Shown above as a plain string for brevity.
- `fee.type` is one of `percent`, `flat`, `none`, `charged_amount_unstated`. Garvee's terms map to one condition with `charged_amount_unstated` and `return_shipping.type` of `customer_pays_unstated`.
- Fields the store did not address are `null`, never guessed.

### 8.4 Model and key handling

- Anthropic API, key in a server-side environment variable in `.env`, which is git-ignored.
- The key never appears in frontend code, in a commit, or in any chat. Chat transcripts are part of the submission.
- Prefer a fast model tier. Check the current model list in the Anthropic docs before choosing.

## 9. Architecture

Stack: TypeScript throughout. A small Node server, a Vite + React page, and Vitest for `cost`.

- Frontend: single page. A scripted assistant thread and the card.
- Server: holds the API key and proxies model and Shopify calls.
- Modules, each with one job:
  - `profile`: the hosted agent profile and `tools/list` discovery per store.
  - `catalog`: Global Catalog lookup and Storefront Catalog sample search.
  - `cart`: create, read and cancel carts; hand-off URLs.
  - `ask`: `ask_business` calls and the policy-page fallback.
  - `extract`: model calls with schema validation and quote checks.
  - `cost`: pure functions that turn terms and prices into dollar amounts, with unit tests.
  - `ui`: thread, card, empty states, "How I checked" strip.

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
- Listing filter: when the app itself surfaces a product, drop any with no `checkout_url` or fewer than 10 ratings. Never drop the product the buyer brought: check it anyway and show its rating count as it is. In testing, "Similar" surfaced three stores selling one table with the same photo at about 15 times the price, with no rating and no checkout link.

### 10.4 Data quality

- `description.plain` contains HTML and sometimes raw CSS. Strip before display and before sending to the model.
- `metadata.tech_specs` contradicted a seller's own text (leg diameter in cm vs in, four sizes vs three). Never render inferred metadata as fact.

## 11. Verification run (first task, before any UI)

Time box: 45 minutes. If the ask tool cannot be reached in that time, continue with the policy-page fallback in 7.5 and note it for the Reflection.

Stores:

- A: a well-known brand with swatches. The owner's probes used Burrow. Find a Burrow sofa through Global Catalog.
- B: a generic seller. Try Garvee first, then OHWILL.com or Furnirem. All three appeared in the dashboard tests with checkout links.

Demo ZIP: 14228 (Buffalo, the owner's own). Use another ZIP only if store A's cart cannot price 14228.

Steps, for each store:

1. Build or find a 2026-08-25 agent profile declaring the capabilities in 7.1. Host it if needed.
2. `tools/list` on the store endpoint. Record which tools appear.
3. Global Catalog `lookup_catalog` by product URL for one sofa. Record the variant ID and seller fields.
4. `create_cart` with the demo ZIP. Record totals and the variant priced. Then `cancel_cart`.
5. Storefront `search_catalog` for "swatch". Record results and whether one matches the sofa's fabric.
6. Compare the cart's variant and price with the Catalog's. Record whether any difference is a hidden cost or a variant mismatch.
7. `ask_business` with the return question in 7.5. Save the full answer.
8. Made-to-order test: find a made-to-order or custom-fabric sofa at store A. Call `ask_business` with its variant ID and also fetch the store's generic refund policy page. Save both. If the item-specific answer differs from the generic policy (for example, final sale on custom fabric), make it the main demo moment.
9. Save every response as a fixture for the `recorded` mode.

Pass criteria: store A returns usable values for all three rows. Store B may return empty rows; that is the second demo case.

Result, 2026-11-15: both stores passed. Full write-up in `docs/verification.md`; responses in `fixtures/verification/`. Store A is the Burrow Nomad Sofa and store B the Garvee 137" Cloud Sectional, both for ZIP 14228. Burrow has no made-to-order items, so step 8 found no demo moment. A returns question about an add-on did surface the policy's add-on exception, so `ask_business` does answer about specific items.

## 12. Build stages

Stop for the owner's review after each stage. Within stages 3 and 4, build rows in priority order, so whatever is finished still demos: "If you're wrong" first, then "Price at your door", then "Try it first."

1. **Verification and fixtures** (section 11). Done 2026-11-15.
2. **Card shell on fixtures.** Scripted thread, URL and ZIP input, card, three rows, empty states, "How I checked" strip, two action buttons.
3. **Live calls** behind the data layer: lookup, cart, sample search, refund policy page fetch, and `ask_business`.
4. **Extraction and cost.** Model extraction with quote checks; `cost` arithmetic with unit tests.
5. **Actions.** Sample and buy hand-offs, both through `checkout_url`.
6. **Demo polish.** Timing, recorded mode, rehearsal against three minutes.

## 13. Demo path and video outline

- **0:00 to 0:30, problem.** "You've never bought furniture online. You found this sofa on ChatGPT. You see one price; the costs that decide it are hidden." One statistic. The vision line.
- **0:30 to 1:45, store A (Burrow Nomad).** Paste the link. ZIP 14228. The card fills: $1,433 at the door against $1,364 listed, a $1 swatch in the exact fabric, and what a return costs in the store's words, including the free exchange. Open "How I checked." Tap "Order the sample."
- **1:45 to 2:15, store B (Garvee).** Half the price and free delivery, but no sample, and a return costs a restocking fee and return shipping the store doesn't state. The contrast is the point: the cheaper sofa hides its way back. State it neutrally, as what each store says.
- **2:15 to 3:00, reflection.** See section 14.

## 14. Reflection notes

Weakest parts:

- It is a bet. No published evidence shows a swatch leads to the sofa purchase. Warby Parker and Amazon ended home try-on in 2025, for cost and store-coverage reasons, not proven failure. The return-leniency meta-analysis supports the "if you're wrong" row. The test to run: show the card or not, and measure sample orders and purchases.
- Coverage is uneven and thinnest at generic sellers, where doubt is highest.
- `ask_business` returns an AI-written summary, which was vaguer than the policy page in testing. The card therefore quotes the policy page and labels the assistant's answer. Extraction can still err; the quote check limits this but does not remove it.
- The door price is a cart estimate. Authoritative shipping and tax come at checkout.
- The cart needs a shipping destination to quote delivery, so a ZIP-only check can miss delivery at some stores.
- The prototype simulates the agent surface. The real home is inside an assistant or the shopper's browser.

Merchant question: the card favours stores with lenient terms. The meta-analysis suggests clear, lenient terms raise purchases, so it rewards merchants who offer a safe way back.

Next, with more time:

- Run the check inside an agent, through UCP or WebMCP, as the step before checkout.
- "Will it get through the door": compare box dimensions with doorway and stair measurements. More useful to first-timers than a room plan, but it needs package dimensions the Catalog does not carry today.
- Showrooms through UCP location search, to answer "how does it feel to sit on?"
- Follow-up questions answered by the store through `ask_business`, which already surfaced an item-specific exception (Burrow's add-ons) in verification.
- Compare the same piece across stores on the same three rows. The owner's probes found 35% of sampled pieces sold by several stores, and the cheapest listing was never the one with the best way back.

## 15. References

- Shopify agentic commerce docs: https://shopify.dev/docs/agents
- Global Catalog MCP: https://shopify.dev/docs/agents/catalog/global-catalog
- Storefront Catalog MCP: https://shopify.dev/docs/agents/catalog/storefront-catalog
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