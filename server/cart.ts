// Price at the door through the Cart MCP (spec 7.3). The destination is
// country plus ZIP: verification showed both stores quote delivery with that
// alone, so the check never needs a street address.

import type { Transport } from "./ucp/transport";

export interface CartQuote {
  variantId: string | null;
  linePriceCents: number | null;
  subtotalCents: number;
  /** null when the cart returned no delivery line. */
  deliveryCents: number | null;
  deliveryLabel: string | null;
  totalCents: number;
  cancelled: boolean;
}

export async function quoteDoorPrice(
  t: Transport,
  storeDomain: string,
  variantId: string,
  zip: string,
): Promise<CartQuote> {
  const where = { address_country: "US", postal_code: zip };
  const created = await t.call(storeDomain, "create_cart", {
    cart: {
      line_items: [{ quantity: 1, item: { id: variantId } }],
      context: where,
      fulfillment: { methods: [{ type: "shipping", destinations: [where] }] },
    },
  });
  const cart = created.structuredContent ?? {};
  const total = (type: string) => (cart.totals ?? []).find((x: any) => x.type === type)?.amount ?? null;

  const group = cart.fulfillment?.methods?.[0]?.groups?.[0];
  const option = (group?.options ?? []).find((o: any) => o.id === group?.selected_option_id) ?? group?.options?.[0];
  const line = cart.line_items?.[0];

  // Close the cart so the check doesn't leave carts open.
  let cancelled = false;
  if (cart.id) {
    const res = await t.call(storeDomain, "cancel_cart", { id: cart.id });
    cancelled = res.structuredContent?.ucp?.status === "success";
  }

  return {
    variantId: line?.item?.id ?? null,
    linePriceCents: line?.item?.price ?? null,
    subtotalCents: total("subtotal") ?? 0,
    deliveryCents: total("fulfillment"),
    deliveryLabel: option?.title ?? null,
    totalCents: total("total") ?? 0,
    cancelled,
  };
}
