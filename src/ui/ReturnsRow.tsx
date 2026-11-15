import type { IfWrongRow, Quote, ReturnLine, ReturnsSources, ReturnWindow } from "../../shared/card";
import { formatUsd } from "../../shared/money";
import { Gap, Row } from "./Card";
import { describeFee, groupByQuotes } from "./format";

// Spec revision 4, principle 4: figures and highlighted quotes come from the
// store's refund policy. The Ask tool's answer is an AI-written summary, so
// it is labelled "The store's assistant" and never styled as the store's words.

export function ReturnsRow({ row }: { row: IfWrongRow }) {
  return (
    <Row label="If you're wrong" source={<SourceLabel row={row} />}>
      <ReturnsBody row={row} />
    </Row>
  );
}

function usesAssistant(row: IfWrongRow): boolean {
  if (row.status === "no_returns") return row.quote.source === "assistant";
  if (row.status === "unverified") return [...row.quotes, ...row.lines.flatMap((l) => l.quotes)].some((q) => q.source === "assistant");
  if (row.status !== "terms") return false;
  return [...row.lines.flatMap((l) => l.quotes), ...(row.window?.quotes ?? [])].some((q) => q.source === "assistant");
}

function SourceLabel({ row }: { row: IfWrongRow }) {
  const { policy } = row.sources;
  if (policy.status === "read") {
    return (
      <>
        <a href={policy.url} target="_blank" rel="noopener noreferrer">
          The store's policy
        </a>
        {usesAssistant(row) && ", with notes from the store's assistant"}
      </>
    );
  }
  return usesAssistant(row) ? <>The store's assistant</> : <>The store's policy couldn't be read</>;
}

function PolicyMissingNote({ sources }: { sources: ReturnsSources }) {
  if (sources.policy.status === "read" || sources.assistant.status !== "answered") return null;
  return (
    <p className="lead">
      I couldn't read the store's policy page, so these terms come from the store's assistant, an AI-written summary.
    </p>
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
  if (row.status === "unverified") {
    // Fail closed: the store's words, and no figure.
    return (
      <>
        <p className="lead">I couldn't check my figures against the store's words, so here is what the store says instead.</p>
        <Quotes quotes={row.quotes} />
        <p className="breakdown unverified-reason">{row.reason}</p>
        {row.lines.map((l, i) => (
          <div className="quote-group" key={i}>
            <Line line={l} />
            <Quotes quotes={l.quotes} />
          </div>
        ))}
        <WindowBlock window={row.window} />
      </>
    );
  }
  if (row.status === "unreadable") {
    return (
      <>
        <p className="plain error-text">Couldn't read the store's terms.</p>
        <p className="breakdown">{row.reason} What was read is under How I checked.</p>
      </>
    );
  }

  const groups = groupByQuotes(mergeUnstated(row.lines));
  return (
    <>
      <PolicyMissingNote sources={row.sources} />
      {row.lines.some((l) => l.kind === "loss") && <p className="lead">What you lose if you send it back:</p>}
      {groups.map((g, i) => (
        <div className="quote-group" key={i}>
          {g.lines.some((l) => l.kind === "loss") && (
            <table className="losses">
              <tbody>{g.lines.map((l, j) => (l.kind === "loss" ? <LossRow key={j} line={l} /> : null))}</tbody>
            </table>
          )}
          {g.lines.map((l, j) => (l.kind === "loss" ? null : <Line key={j} line={l} />))}
          <Quotes quotes={g.quotes} />
        </div>
      ))}
      <WindowBlock window={row.window} />
    </>
  );
}

function WindowBlock({ window }: { window: ReturnWindow | null }) {
  if (!window) return null;
  return (
    <div className="quote-group">
      <p className="plain">
        {window.days !== null ? `Return within ${window.days} days` : "Return window"}
        {window.starts ? ` of ${window.starts}.` : ". "}
        {!window.starts && <Gap>start not stated</Gap>}
      </p>
      <Quotes quotes={window.quotes} />
    </div>
  );
}

type Loss = Extract<ReturnLine, { kind: "loss" }>;

function LossRow({ line }: { line: Loss }) {
  const charged = line.includesReturnShippingCents > 0 || line.includesDeliveryCents > 0;
  const parts = line.fee.type === "none" && charged ? [] : [describeFee(line.fee)];
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

type Merged = ReturnLine | { kind: "both_unstated"; quotes: Quote[] };

/** Restocking fee and return shipping both unstated read better as one sentence (spec 6.3 table). */
function mergeUnstated(lines: ReturnLine[]): Merged[] {
  const fee = lines.find((l) => l.kind === "fee_unstated");
  const ship = lines.find((l) => l.kind === "return_shipping_unstated");
  const same = fee && ship && JSON.stringify(fee.quotes) === JSON.stringify(ship.quotes);
  if (!fee || !ship || !same) return lines;
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
          + {line.deliveryCents === null ? "delivery charges" : `${formatUsd(line.deliveryCents)} delivery`}, <Gap>refund not stated</Gap>
        </p>
      );
    case "exchange": {
      const what = line.count === 1 ? "one free exchange" : line.count ? `${line.count} free exchanges` : "a free exchange";
      return (
        <p className="plain exchange">
          <span className="figure figure-small">Or $0:</span> {what}
          {line.conditions ? `, ${line.conditions}` : ""}.
        </p>
      );
    }
    case "final_sale":
      return <p className="plain">{line.value ? "Final sale: no returns on this item." : "Not final sale."}</p>;
    case "disagreement":
      return (
        <p className="plain">
          <Gap>The policy and the store's assistant disagree on {line.topic}.</Gap> Both are quoted below.
        </p>
      );
    case "cost_unstated":
      return (
        <p className="plain">
          <Gap>Neither the policy nor the store's assistant says what a return costs.</Gap>
        </p>
      );
    case "loss":
      return null;
  }
}

/** Policy quotes in the store's voice; the assistant's words labelled, in plain type. */
function Quotes({ quotes }: { quotes: Quote[] }) {
  const policy = quotes.filter((q) => q.source === "policy");
  const assistant = quotes.filter((q) => q.source === "assistant");
  return (
    <>
      {policy.length > 0 && (
        <blockquote className="store-words">
          {policy.map((q, i) => (
            <span key={i}>
              {i > 0 && " … "}
              <mark>{q.text}</mark>
            </span>
          ))}
        </blockquote>
      )}
      {assistant.length > 0 && (
        <p className="assistant-words">
          <span className="assistant-label">The store's assistant:</span> “{assistant.map((q) => q.text).join(" … ")}”
        </p>
      )}
    </>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
