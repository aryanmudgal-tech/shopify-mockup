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
