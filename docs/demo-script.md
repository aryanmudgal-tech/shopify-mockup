# Demo script - 3 minutes

- Spec: section 13 of the [design spec](specs/2026-11-15-before-you-buy-design.md).
- Rehearsed: 2026-11-15, recorded mode, on http://localhost:5173/?clean.
- Pace: narration timed at 150 words a minute. The app's own waits run under the narration, so they add no time.

## Before recording

- [ ] `npm run dev`, then open http://localhost:5173/?clean. The footer should say "Recorded Shopify responses from Nov 15, 2026" and nothing else.
- [ ] Optional: `npx tsx scripts/cache-images.ts` once, so the two photos and the swatch load with no network.
- [ ] Copy the Burrow link to the clipboard: `https://burrow.com/products/nomad-plus-sofa?variant=50484946305326`
- [ ] Keep the Garvee link ready to paste second: `https://www.garvee.com/products/garvee-137-modular-cloud-sectional-sofa-large-u-grey-vnn-33c9xngg?variant=51296972898617`
- [ ] Browser zoom so the whole card fits the recording frame once you scroll.
- [ ] Clicking "Order the sample" opens Burrow's real checkout in a new tab. Nothing is bought, but close that tab after the take.

## Measured in the app

| Step | Time |
|---|---|
| Send the link -> "What ZIP will this be delivered to?" | under 0.1 s |
| Send ZIP 14228 -> Burrow's card appears | 1.7 s (the recorded pace) |
| Card fully revealed, top to bottom | 2.7 s after the ZIP |
| Send Garvee's link -> its card appears (ZIP remembered) | 1.6 s |

Everything on screen takes about 12 seconds in total, including typing the ZIP, opening "How I checked" and scrolling. All of it happens while you talk.

## 0:00 - 0:30, the problem (80 words, 32 s)

**On screen:** the thread, with only the buyer's opening message and the assistant's reply.

> Agents find the product. This is the check before you pay.
>
> Imagine you've just moved into your first apartment, and you've never bought furniture online. You find this sofa on ChatGPT. You see one price, but the costs that decide it are hidden: what it really costs at your door, whether you can try it first, and what you lose if you're wrong. Morning Consult found that nearly 40% of shoppers drop a home furnishings purchase they meant to make.

## 0:30 - 1:45, Burrow (186 words, 74 s)

**On screen:** paste the Burrow link and press Enter. Type 14228 and press Enter. Point at each row as it arrives, and at each of the three return cases. Click "Read in detail" to show the store's words. Open "How I checked" and scroll through it. Click "Order the sample ($1)".

> I paste the link, and the assistant asks one question: my ZIP. It's the only thing it needs, because the price and the return costs depend on it.
>
> To buy: $1,433 at my door, not the $1,364 I saw. A cart for 14228 adds $69 shipping.
>
> Try it first: Burrow sells a $1 swatch, and the check found the exact fabric, Crushed Gravel Performance Chenille. The store's own search ranked a different weave first. The model picked the right one, and the code checked it's real.
>
> If I return it, it depends on what I do. I can exchange it once for free, as long as I keep the box. Picking the wrong fabric is exactly what a first-timer fears, so that case comes first. Sending it back costs $136.40 with the box, or $250 without. Read in detail shows Burrow's own policy, word for word. It doesn't say whether delivery is refunded, so the card says that instead of guessing.
>
> How I checked shows every call, the policy text, and the assistant's answer, labelled as an AI summary.
>
> So I order the $1 swatch first.

## 1:45 - 2:15, Garvee (73 words, 29 s)

**On screen:** paste the Garvee link and press Enter. The ZIP is remembered, so the card comes straight back. Point at the empty sample row, the returns row, and the "View on GARVEE's site" button.

> Now a cheaper sofa from a generic seller. Half the price and free delivery. But there's no sample, and a return costs a restocking fee and return shipping that the store doesn't put a number on. The cheaper sofa hides its way back, and the card says so neutrally, as what each store says.
>
> One honest detail: Garvee's checkout link doesn't work from outside its site, so the button says View, not Buy.

## 2:15 - 3:00, reflection (102 words, 41 s)

**On screen:** the two cards, or the README's "What I'd want a reviewer to know".

> What's weak? It's a bet. Nothing published shows a swatch leads to the sofa purchase, so I'd test it: show the card or not, and measure sample orders and purchases.
>
> Coverage is thinnest at generic sellers, where doubt is highest. And the model can still misread, so every figure is checked against the store's words, and the card fails closed when it can't be.
>
> For merchants, the card rewards a clear, lenient way back, which research says raises purchases.
>
> Next, I'd run this inside an agent as the step before checkout, and add "will it get through the door", using box dimensions.

## Total

441 words, which is 2:56 at 150 words a minute, so there are about 4 seconds to spare. The problem beat runs 2 seconds over its slot and the Burrow beat has 1 second in hand. If the take runs long, cut the "One honest detail" line in the Garvee beat (about 9 seconds).
