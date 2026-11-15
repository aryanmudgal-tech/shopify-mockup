# Verification run - 2026-11-15

- Spec: [section 11 of the design spec](specs/2026-11-15-before-you-buy-design.md)
- Run with: Claude Code and [`scripts/ucp.mjs`](../scripts/ucp.mjs), a small UCP client with no dependencies. Every request and response is saved under [`fixtures/verification/`](../fixtures/verification/) for the `recorded` mode.
- Demo ZIP: 14228. Burrow's cart priced it, so no second ZIP was needed.
- Result: both stores PASS. Store A has usable values for all three rows, and store B gives the empty and unstated case. ADVANCE to stage 2 once the decisions in section 6 are made.

## 1. Agent profile

Shopify hosts two example profiles at UCP 2026-08-25, and neither one declares everything the spec needs. [`valid-with-capabilities.json`](https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json) covers catalog, cart and checkout but not ask, and [`ask.json`](https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/ask.json) covers only `dev.ucp.common.ask`.

Every request carries its own profile, so I send `ask.json` on `ask_business` calls and the other profile on everything else. `tools/list` on both stores confirmed it: the first profile returns the cart, catalog and checkout tools, and the second returns `ask_business`. I don't need to host my own profile for the prototype. The docs say the examples are for testing, which I'll mention in the Reflection.

The Global Catalog call from section 10.2 also works from a terminal with no `Authorization` header.

## 2. Store A: Burrow, Nomad Sofa

The product is the [Nomad Sofa](https://burrow.com/products/nomad-plus-sofa?variant=50484946305326) in Crushed Gravel Performance Chenille with block arms and black metal legs. Its variant ID is `gid://shopify/ProductVariant/50484946305326`, the seller domain is `burrow-prod.myshopify.com`, and it has 18 ratings averaging 3.8.

This is what the card would show for 14228:

| Row | Value | Source |
|---|---|---|
| To buy | $1,364.00 listed (list price $1,949.00), $1,433.00 at the door before tax | Cart estimate for 14228: $1,364 + $69 Standard Shipping |
| Try it first | $1.00 swatch in Crushed Gravel Performance Chenille, the exact fabric | Store catalog |
| If you're wrong | $136.40 with the box, $250.00 without, + $69 delivery, refund not stated. Within 30 days of confirmed delivery. | The store's answer |

### 2.1 Identify the product

`lookup_catalog` accepts product URLs in `catalog.ids`. The plain URL `burrow.com/products/nomad-plus-sofa` returned `not_found`, but the same URL with `?variant=50484946305326` resolved to the right variant. Garvee's plain URL worked, so this seems to be specific to Burrow. The demo link must include the variant, and stage 3 still needs the search fallback.

### 2.2 Price at the door

My first cart only had the ZIP in `context`, and it came back with no delivery line at all. The delivery quote only appears when the cart includes a shipping destination under `fulfillment.methods[].destinations[]`. That cart returned Standard Shipping at $69, the same figure as the 2026-11-14 probe. I assume the missing destination also explains why only 12 of 22 carts quoted delivery in that earlier probe, but I haven't checked this.

What did I actually send? The destination in `04c` was country `US`, state `NY` and ZIP `14228`, with no street address and no city. I took NY from the ZIP myself, so I reran with country and ZIP only (`04e`) to find the real minimum. Burrow still quoted $69 and Garvee still quoted free delivery (`garvee/04c`). The cart echoes the destination back with an empty `street_address` and `address_locality`. So the minimum is country plus ZIP, and the app never needs a street address, a city or a ZIP-to-state lookup to show delivery.

The cart shows no tax line, so I treat its total as the price before tax. Both test carts were cancelled afterwards.

### 2.3 Try it first

Burrow sells swatches as ordinary products named after the fabric, for $1.00 each, not $0. A plain "swatch" search returned 20 swatches without the sofa's exact fabric, while "Crushed Gravel swatch" found Crushed Gravel Performance Chenille (`gid://shopify/ProductVariant/50269421830446`). So the fabric-specific query from spec 7.4 is REQUIRED. The swatch's `checkout_url` is a cart permalink (`/cart/50269421830446:1`), so the sample hand-off doesn't need its own cart.

### 2.4 If you're wrong

`ask_business` gave a clear answer for the sofa. The fee is 10% of the amount paid with the original packaging or 20% without it, capped at $250. Burrow arranges the pickup, and the fee is described as the return-shipping fee. Original delivery charges are "not addressed", the window is 30 calendar days from confirmed delivery, and the sofa is not final sale. The refund policy page says the same thing, and it also offers one free exchange within 30 days with the original packaging.

### 2.5 Made-to-order test

Burrow has no made-to-order or custom-fabric sofas, and its policy uses one rule for all furniture. The sofa's answer matched the generic policy, so there is no demo moment here. To check whether `ask_business` knows about specific items at all, I asked about the Title Storage Case Add-on. It raised the policy's exception for "individually purchased components or add-ons", though it hedged. So the tool knows about items, but Burrow gives it nothing surprising to say about a sofa.

## 3. Store B: Garvee, 137" Cloud Sectional

The product is the [Garvee 137" Modular Cloud Sectional](https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg) in grey corduroy, 4 seats and 2 ottomans. Its variant ID is `gid://shopify/ProductVariant/51296972898617`, the seller domain is `mygarvee.myshopify.com`, and it has 192 ratings. Garvee worked on the first try, so I didn't need OHWILL or Furnirem.

| Row | Value | Source |
|---|---|---|
| To buy | $681.99 listed (list price $887.99), $681.99 at the door before tax | Cart estimate for 14228: free delivery, "Delivered in 3-5 business days" |
| Try it first | This store lists no sample. | Store catalog |
| If you're wrong | You pay return shipping and a restocking fee, and the store states neither amount. 30-day window, start not stated. | The store's answer |

The swatch search is a good test for the matcher. "swatch" returned ultrasonic cleaners, "sample" returned rugs and a paint set, and "corduroy swatch" returned sofas, so the model has to reject all of them. The return answer and the policy page agree that the buyer covers "the cost of returning and restocking the item" on change-of-mind returns.

## 4. Catalog vs cart (step 6)

Both carts priced the same variant at the same price as the Catalog. Burrow was $1,364.00 in both and Garvee was $681.99 in both. The only difference was delivery, so neither case was a hidden cost or a variant mismatch.

## 5. Facts for the build

- The cart object sits directly at `result.structuredContent`, with no `cart` wrapper. The same payload also appears as JSON text in `result.content[0].text`.
- Cart IDs include a `?key=` parameter. `cancel_cart` needs the full ID as the top-level `id` and a fresh UUID in `meta["idempotency-key"]`.
- Store search returns store-native product IDs (`gid://shopify/Product/...`). Global Catalog returns `gid://shopify/p/...`, which `ask_business` rejects, so ask always gets the variant ID.
- In Global Catalog the product-level `url` is null for both stores, and the storefront link is on the variant's `url`.
- Call the store's UCP endpoint on `seller.domain`, not on the storefront host. `www.garvee.com` is a separate site and returns an HTML page at `/api/ucp/mcp`, while `mygarvee.myshopify.com` answers. Burrow happens to answer on both.
- `ask_business` answers sometimes include dollar figures the store worked out itself, such as "$24.20 with the packaging". My code still does all the arithmetic, and the quote check still applies.

## 6. Decisions before stage 4

The extraction contract in spec 8.3 couldn't hold everything these two answers say, so I proposed six changes. All six were ACCEPTED on 2026-11-15 and folded into spec revision 3. The free exchange is a required line on the card, because picking the wrong fabric is exactly what a first-timer fears, and leaving it out would make Burrow look riskier than it is.

1. **Fee cap.** Burrow caps its fee at $250, so 20% of $1,364 becomes $250.00 instead of $272.80. Proposal: add `fee_cap` with a quote, and compute the fee as the smaller of price × fee % and the cap.
2. **Return shipping included in the fee.** Burrow's fee IS the return shipping. With today's contract the card would wrongly add "+ return shipping, amount not stated". Proposal: add `included_in_fee` to `return_shipping.type`.
3. **Fee mentioned with no amount.** Garvee charges a restocking fee but never says how much. Proposal: allow `refund_pct: null` with a quote, and show "+ restocking fee, amount not stated by the store".
4. **Free exchange.** Burrow offers one free exchange with the original box, so a buyer who picks the wrong fabric can lose $0. Proposal: add one clause about exchanges to the ask query and show one line in the "If you're wrong" row.
5. **Made-to-order moment.** There isn't one at Burrow. Proposal: drop it from the demo path. The $250 cap, the unstated delivery refund, and Garvee's unstated fees carry the demo.
6. **$1 swatch.** The spec's illustration and demo path say "$0 swatch". Proposal: update them to $1.

## 7. Fixtures

Files are numbered by the step in spec section 11. `00` is the store's `/.well-known/ucp`, `01` and `02` are the Global Catalog search and lookup, `03` is `tools/list` per profile, `04` is the cart and its cancel (`04e` and `garvee/04c` are the country-plus-ZIP reruns), `05` is the swatch search, `07` is the return question, and `08` is the policy page and the made-to-order probes. Each JSON file holds the request, the HTTP status and the full response.

## 8. Live mode run - stage 3

- Run with: [`scripts/check.ts`](../scripts/check.ts), which runs the app's own check from the terminal (`npx tsx scripts/check.ts <link> 14228`).
- Result: all three live checks PASS and match the recorded cards.

| Link | Time | What came back |
|---|---|---|
| Burrow Nomad, with `?variant=` | 1.7s | $1,433 at the door, $1 Crushed Gravel Performance Chenille swatch, $136.40 or $250 back, + $69 delivery, refund not stated, one free exchange, not final sale |
| Garvee Cloud Sectional | 2.2s | $681.99 with free delivery, no sample after three searches, both fees charged with neither amount stated |
| Burrow Nomad, plain link | 2.4s | Lookup found nothing, so the app read the product page, searched the Catalog for its title "Nomad Sofa" and took Burrow's listing. The card says the variant was guessed. |

### 8.1 What I noticed

- **The assistant answered word for word what it said two hours earlier.** Both stores' live `ask_business` answers were identical to the `07b` fixtures and came back in about a second. I assume Shopify caches answers to the same question for the same item, but I haven't checked this. It means the assistant's quotes pass the exact-substring check today, but a reworded answer would drop them, which is the right failure.
- **The policy pages hadn't changed either.** The text the live check read from both `refund_policy` links matched the recorded HTML line for line, so every policy quote held.
- **Live searches return more results than the fixtures.** The app asks for 20 results where the verification run asked for 10, so Garvee's "Corduroy swatch" search shows 20 results live and 10 recorded. Neither contains a sample, so the card is the same.
- **burrow.com served its product page to the server** without blocking it, so the title fallback works for Burrow. Other stores may block it; then the app searches with the link's handle words instead.

## 9. Model extraction - stage 4

- Model: `claude-haiku-5-5`, the fast tier, which is on the live model list for this key on 2026-11-15.
- Output: a forced, strict tool call. `tool_choice` names the tool and `strict: true` makes the input match the schema in [`server/terms.ts`](../server/terms.ts).
- **Temperature 0 isn't possible.** The spec asked for it, but Haiku 5.5 rejects any non-default temperature with a 400, and on API version 2026-10-21 (what the SDK sends) every model does. Repeatable runs come from the strict schema and from the cache instead.
- Cache: every read is saved under [`fixtures/model-cache/`](../fixtures/model-cache/), keyed by a hash of the policy text, the assistant's answer and the variant ID, plus the model and a prompt version. A live Burrow check whose texts haven't changed took 2.6 seconds with the saved read and 6.5 seconds without it, and the recorded demo and `npm test` need no network and no key.

### 9.1 How a read becomes a figure

The model reads the policy page and the assistant's answer in two separate calls, so it can't blend them. Code then checks every value: each quote must be an exact passage of its own source, each number (10%, $250, 30 days) must appear in that field's own quotes, and a value needs at least one quote. Anything that fails goes back to the model once as a tool error, and what still fails is dropped as unknown.

Code then compares the two reads field by field ([`server/reconcile.ts`](../server/reconcile.ts)). If both state a value and the values differ, the field becomes a disagreement: the card shows both quotes with their labels and computes nothing from either. Otherwise the policy wins where it speaks, and the assistant fills what the policy doesn't cover. [`server/cost.ts`](../server/cost.ts) does all the arithmetic.

### 9.2 Golden test

The hand-written Burrow and Garvee lines from stages 2 and 3 are now expected outputs in [`server/golden/expected.ts`](../server/golden/expected.ts). The test compares figures, conditions, fee rates and caps, the window, the exchange, final sale and which source each line quotes, and checks every quote against its source. It also checks that the model picks Burrow's Chenille swatch, which the store's search ranks below the Basketweave.

One correction while converting: Burrow's policy says "The fee is always capped at $250, per returned item", so the with-box fee carries the cap too. It doesn't bind, so no figure changed.

The first fresh runs missed three judgment calls:

1. Burrow's policy read called the window start plain "delivery", although its own quote says "delivered per shipping carrier confirmation".
2. One Burrow assistant read filed return shipping as "customer pays, amount unstated", which raised a false disagreement with the policy.
3. One Garvee policy read called the return fee "none", which I assume came from the cancellation line "We will not impose any processing fee on you".

A forced tool call gives Haiku no room to think, so I added a first `analysis` field to the tool. The model writes which passages apply and which it sets aside, then fills the values. I also added two general rules: a cancellation processing fee isn't a return fee, and a fee described as the return shipping charge means shipping is included in the fee.

After that, fresh reads matched the golden lines 22 times in a row: 16 on the recorded texts and 6 against live Shopify. The swatch reads matched every time, and the model gave its reason ("the Performance Basketweave sample is a different weave").

## 10. Generalization run - three more stores

- Run with: `npx tsx scripts/check.ts <link> 14228 --record fixtures/generalization/<store>`, live, on 2026-11-15. Every call, page and the final card are in [`fixtures/generalization/`](../fixtures/generalization/). None of these stores is part of the demo.
- Stores: three furniture sellers from Global Catalog that offer `ask_business`, picked for variety. Sundays sells one swatch per fabric, Rove Lab sells a swatch kit, and Slumberland is a traditional furniture retailer.

| Store and product | To buy | Try it first | If you're wrong |
|---|---|---|---|
| Sundays, Get Together 3-Piece Modular Sofa, Cream Linen | FILLED: $3,800, free delivery | FILLED: $0 Cream Linen swatch, the exact fabric | FILLED, but one figure is WRONG (see 10.1) |
| Rove Lab, M1 Boneless Sofa Sectional, Helium Cloud | Partly: $997 listed, the cart quoted no delivery | Empty: the store sells a kit, not this fabric's swatch | FILLED: $99 for any return, 100 days, a disagreement on return shipping |
| Slumberland, Mahoney Loveseat, Chocolate | Partly: $489.99 listed, the cart quoted no delivery | Empty: no swatches, which is right | Unreadable |

Rows filled: Sundays 3 of 3, Rove Lab 1 of 3 plus a partial door price, Slumberland 0 of 3 plus a partial door price.

### 10.1 Extraction errors I found by reading the policies myself

1. **Sundays, wrong figure.** The policy charges "A flat rate return shipping fee of $150" on every return, plus "a return re-packaging fee of $75" without the original packaging. So a return costs $150 with the box and $225 without. The card says $150 and $75, so the without-box return looks cheaper. Every quote was real, which is why the quote check couldn't catch it. The cause is my contract: one charge can be filed as a fee or as return shipping. The policy read filed the $150 as the with-box fee, and the assistant read filed it as return shipping, which also raised a false disagreement.
   - **Proposed fix:** a rule that a charge called return shipping goes in `return_shipping` unless the fee itself is described as the shipping charge, plus a code check that flags any card where the without-box loss is lower than the with-box loss.
2. **Rove Lab, over-reading.** The policy read called return shipping "free" because of "We will then send you a return shipping label". The policy never says the label is free. The assistant says the $99 fee covers return shipping. The card showed both quotes and computed nothing from either, so the buyer still sees the $99 fee. That's the right failure, but the policy read shouldn't have inferred "free".
3. **Slumberland, missed term.** The assistant's answer says the store "offers a full refund if you’re unhappy with its size, shape, look, or fit within the first 5 days after taking possession". The model read the 5-day window correctly but didn't read "full refund" as no fee. With no cost line, the card turns unreadable and hides the window it does know. Two fixes are possible: treat a stated full refund as no fee, and show a known window even when costs are unknown.

### 10.2 What else the run showed

- **Swatch matching generalized well.** At Sundays the model picked "Swatch Cream Linen, LiveLife™ Fabric" and named the Cream Boucle swatch as a different fabric.
- **Two of three carts quoted no delivery** with country and ZIP. Burrow and Garvee both did, so the "Price at your door" row is thinner than the demo suggests. The card says so instead of guessing.
- **Slumberland's `refund_policy` link has no return terms.** It covers service, repairs and payment refunds. The assistant knew the 5-day rule from somewhere else.
- **"This store lists no sample" is too strong for Rove Lab,** which does sell a swatch kit. Better copy for that case: "No sample of this exact fabric."
- **Maiden Home, which I didn't run in full,** puts the fabric in the product title instead of an option, so the check has no fabric to match a swatch against.
