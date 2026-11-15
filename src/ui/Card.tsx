import type { Card as CardModel, ProductHeader, ToBuyRow, TryFirstRow } from "../../shared/card";
import { formatUsd } from "../../shared/money";
import { HowIChecked } from "./HowIChecked";
import { thumb } from "./format";
import { ReturnsRow } from "./ReturnsRow";
import { Swatch } from "./Swatch";

export type HandoffKind = "sample" | "buy";

export function Card({ card, onHandoff }: { card: CardModel; onHandoff?: (kind: HandoffKind) => void }) {
  return (
    <article className="card" aria-label={`Check for ${card.product.title}`}>
      <Header product={card.product} />
      <Row label="To buy" source={`Cart estimate for ${card.zip}`}>
        <ToBuy row={card.toBuy} />
      </Row>
      <Row label="Try it first" source="Store catalog">
        <TryFirst row={card.tryFirst} />
      </Row>
      <ReturnsRow row={card.ifWrong} />
      <HowIChecked steps={card.steps} />
      <Actions card={card} onHandoff={onHandoff} />
    </article>
  );
}

export function Row({ label, source, children }: { label: string; source: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="row">
      <h3 className="row-label">{label}</h3>
      <div className="row-body">
        {children}
        <p className="source">{source}</p>
      </div>
    </section>
  );
}

function Header({ product }: { product: ProductHeader }) {
  return (
    <header className="card-head">
      {product.imageUrl ? (
        <img className="product-photo" src={thumb(product.imageUrl, 240)} alt="" />
      ) : (
        <div className="product-photo product-photo-missing" aria-hidden />
      )}
      <div className="card-head-text">
        <h2 className="product-title">{product.title}</h2>
        <ul className="options">
          {product.options.map((o) => (
            <li key={o.name}>
              <span className="option-name">{o.name}</span> {o.label}
            </li>
          ))}
        </ul>
        {product.variantNote && <p className="variant-note">{product.variantNote}</p>}
        <div className="seller-line">
          <span className="seller">{product.seller.name}</span>
          {product.rating ? (
            <span className="rating">
              {product.rating.value} out of {product.rating.scaleMax}, {product.rating.count} ratings
            </span>
          ) : (
            <span className="rating">No ratings</span>
          )}
          <span className="listed">
            <strong>{formatUsd(product.listedCents)}</strong> listed
          </span>
        </div>
      </div>
    </header>
  );
}

function ToBuy({ row }: { row: ToBuyRow }) {
  switch (row.status) {
    case "priced":
      return (
        <>
          <p className="figure-line">
            <span className="figure">{formatUsd(row.doorCents)}</span> at your door, before tax
          </p>
          <p className="breakdown">
            {formatUsd(row.listedCents)} listed +{" "}
            {row.deliveryCents === 0 ? (
              <>free delivery, “{row.deliveryLabel}”</>
            ) : (
              <>
                {formatUsd(row.deliveryCents)} {row.deliveryLabel}
              </>
            )}
          </p>
        </>
      );
    case "no_delivery_quote":
      return (
        <p className="plain">
          {formatUsd(row.subtotalCents)} in the cart. <Gap>delivery not quoted</Gap> The cart didn't name a delivery
          price for this ZIP, so checkout will.
        </p>
      );
    case "mismatch":
      return (
        <p className="plain error-text">
          {row.detail} The cart said {formatUsd(row.cartCents)}; the listing says {formatUsd(row.catalogCents)}.
        </p>
      );
    case "unavailable":
      return <p className="plain error-text">Couldn't price a cart: {row.reason}</p>;
  }
}

function TryFirst({ row }: { row: TryFirstRow }) {
  if (row.status === "unavailable") {
    return <p className="plain error-text">Couldn't search the store's catalog for a sample: {row.reason}</p>;
  }
  if (row.status === "none") {
    return (
      <div className="sample">
        <Swatch imageUrl={null} />
        <p className="plain">
          {row.otherSamples
            ? "This store sells samples, but none of this exact fabric. The return terms are your way back."
            : "This store lists no sample. The return terms are your way back."}
        </p>
      </div>
    );
  }
  return (
    <div className="sample">
      <Swatch imageUrl={row.imageUrl} />
      <div>
        <p className="figure-line">
          <span className="figure figure-small">{formatUsd(row.priceCents)}</span> swatch of {row.title}
        </p>
        <p className="breakdown">Same fabric as the sofa: {row.matchedOn}</p>
      </div>
    </div>
  );
}

/** Marks information the store or cart didn't give. */
export function Gap({ children }: { children: React.ReactNode }) {
  return <span className="gap">{children}</span>;
}

function Actions({ card, onHandoff }: { card: CardModel; onHandoff?: (kind: HandoffKind) => void }) {
  const sample = card.tryFirst.status === "sample" && card.tryFirst.checkoutUrl ? card.tryFirst : null;
  const buy = card.product.checkoutUrl;
  if (!sample && !buy) return null;
  return (
    <footer className="actions-wrap">
      <div className="actions">
        {sample && (
          <a className="action" href={sample.checkoutUrl!} target="_blank" rel="noopener noreferrer" onClick={() => onHandoff?.("sample")}>
            Order the sample ({formatUsd(sample.priceCents)})
          </a>
        )}
        {buy && (
          <a className="action" href={buy} target="_blank" rel="noopener noreferrer" onClick={() => onHandoff?.("buy")}>
            Buy it
          </a>
        )}
      </div>
      <p className="handoff-note">
        {sample && buy ? "Both open" : "This opens"} {card.product.seller.name}'s own checkout in a new tab. You pay there, not here.
      </p>
    </footer>
  );
}
