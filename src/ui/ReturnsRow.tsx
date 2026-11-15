import type { IfWrongRow, ReturnLine } from "../../shared/card";
import { formatUsd } from "../../shared/money";
import { Gap, Row } from "./Card";
import { describeFee, groupByQuotes } from "./format";

export function ReturnsRow({ row }: { row: IfWrongRow }) {
  const source = (
    <>
      {row.source === "answer" ? "The store's answer" : "From the store's policy page"}
      {row.policyUrl && (
        <>
          {", "}
          <a href={row.policyUrl} target="_blank" rel="noopener noreferrer">
            refund policy
          </a>
        </>
      )}
    </>
  );

  return (
    <Row label="If you're wrong" source={source}>
      <ReturnsBody row={row} />
    </Row>
  );
}

function ReturnsBody({ row }: { row: IfWrongRow }) {
  if (row.status === "no_returns") {
    return (
      <>
        <p className="plain">This store does not accept returns on this item.</p>
        <Quotes quotes={[row.quote]} />
      </>
    );
  }
  if (row.status === "unreadable") {
    return (
      <>
        <p className="plain error-text">Couldn't read the store's answer.</p>
        {row.raw && (
          <details className="raw">
            <summary>Show what the store said</summary>
            <p>{row.raw}</p>
          </details>
        )}
      </>
    );
  }

  const groups = groupByQuotes(mergeUnstated(row.lines));
  const hasLoss = row.lines.some((l) => l.kind === "loss");
  return (
    <>
      {hasLoss && <p className="lead">What you lose if you send it back:</p>}
      {groups.map((g, i) => (
        <div className="quote-group" key={i}>
          {g.lines.some((l) => l.kind === "loss") ? (
            <table className="losses">
              <tbody>
                {g.lines.map((l, j) => (l.kind === "loss" ? <LossRow key={j} line={l} /> : null))}
              </tbody>
            </table>
          ) : null}
          {g.lines.map((l, j) => (l.kind === "loss" ? null : <Line key={j} line={l} />))}
          <Quotes quotes={g.quotes} />
        </div>
      ))}
      {row.window && (
        <div className="quote-group">
          <p className="plain">
            {row.window.days !== null ? `Return within ${row.window.days} days` : "Return window"}
            {row.window.starts ? ` of ${row.window.starts}.` : ". "}
            {!row.window.starts && <Gap>start not stated</Gap>}
          </p>
          <Quotes quotes={[row.window.quote]} />
        </div>
      )}
    </>
  );
}

type Loss = Extract<ReturnLine, { kind: "loss" }>;

function LossRow({ line }: { line: Loss }) {
  const parts = [describeFee(line.fee)];
  if (line.includesReturnShipping) parts.push("includes return shipping");
  if (line.includesReturnShippingCents) parts.push(`includes ${formatUsd(line.includesReturnShippingCents)} return shipping`);
  if (line.includesDeliveryCents) parts.push(`includes ${formatUsd(line.includesDeliveryCents)} delivery the store keeps`);
  return (
    <tr>
      <td className="loss-amount">{formatUsd(line.lossCents)}</td>
      <td className="loss-what">
        {line.condition ? capitalise(line.condition) : "Any return"}
        <span className="loss-detail">{parts.join(", ")}</span>
      </td>
    </tr>
  );
}

type Merged = ReturnLine | { kind: "both_unstated"; quotes: string[] };

/** Restocking fee and return shipping both unstated read better as one sentence (spec 6.3 table). */
function mergeUnstated(lines: ReturnLine[]): Merged[] {
  const fee = lines.find((l) => l.kind === "fee_unstated");
  const ship = lines.find((l) => l.kind === "return_shipping_unstated");
  if (!fee || !ship || fee.quotes.join() !== ship.quotes.join()) return lines;
  const merged: Merged = { kind: "both_unstated", quotes: fee.quotes };
  return lines.flatMap((l): Merged[] => (l === fee ? [merged] : l === ship ? [] : [l]));
}

function Line({ line }: { line: Merged }) {
  switch (line.kind) {
    case "both_unstated":
      return (
        <p className="plain">
          You pay return shipping and a restocking fee. <Gap>the store states neither amount</Gap>
        </p>
      );
    case "fee_unstated":
      return (
        <p className="plain">
          You pay a restocking fee. <Gap>the store doesn't state the amount</Gap>
        </p>
      );
    case "return_shipping_unstated":
      return (
        <p className="plain">
          + return shipping, <Gap>amount not stated by the store</Gap>
        </p>
      );
    case "delivery_refund_unstated":
      return (
        <p className="plain">
          + {formatUsd(line.deliveryCents)} delivery, <Gap>refund not stated</Gap>
        </p>
      );
    case "exchange":
      return (
        <p className="plain exchange">
          <span className="figure figure-small">Or $0:</span> one free exchange, {line.conditions}.
        </p>
      );
    case "loss":
      return null;
  }
}

function Quotes({ quotes }: { quotes: string[] }) {
  if (!quotes.length) return null;
  return (
    <blockquote className="store-words">
      {quotes.map((q, i) => (
        <span key={i}>
          {i > 0 && " … "}
          <mark>{q}</mark>
        </span>
      ))}
    </blockquote>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
