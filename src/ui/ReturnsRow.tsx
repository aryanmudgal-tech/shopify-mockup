import { useState } from "react";
import type { IfWrongRow, Quote, ReturnLine, ReturnsSources, ReturnWindow } from "../../shared/card";
import { formatUsd } from "../../shared/money";
import { Gap, Row } from "./Card";
import { describeFee } from "./format";

// "If you return it". The row shows each way a return can go as its own case,
// cheapest first: exchange it, send it back with the box, send it back without.
// The store's exact words sit one click away under "Read in detail", grouped
// by case; the source line stays visible (spec principle 4, revision 5).
//
// Figures and highlighted quotes come from the store's refund policy. The Ask
// tool's answer is an AI-written summary: it is labelled "The store's
// assistant" and never styled as the store's words.

export function ReturnsRow({ row, seller }: { row: IfWrongRow; seller: string }) {
  return (
    <Row label="If you return it" source={<SourceLabel row={row} seller={seller} />}>
      <ReturnsBody row={row} />
    </Row>
  );
}

// --- Cases --------------------------------------------------------------------

type Icon = "swap" | "box" | "nobox" | "return";
type Figure = { kind: "money"; cents: number } | { kind: "free" } | { kind: "unstated"; text: string };

interface Case {
  icon: Icon;
  title: string;
  condition: React.ReactNode;
  figure: Figure;
  quotes: Quote[];
  /** Label for this case's quotes under "Read in detail". */
  detailLabel: string;
}

interface Note {
  text: React.ReactNode;
  quotes: Quote[];
  detailLabel: string;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lossCase(l: Extract<ReturnLine, { kind: "loss" }>): Case {
  const parts = l.fee.type === "none" && (l.includesDeliveryCents || l.includesReturnShippingCents) ? [] : [describeFee(l.fee)];
  if (l.includesReturnShipping) parts.push("covers return shipping");
  if (l.includesReturnShippingCents) parts.push(`includes ${formatUsd(l.includesReturnShippingCents)} return shipping`);
  if (l.includesDeliveryCents) parts.push(`includes ${formatUsd(l.includesDeliveryCents)} delivery the store keeps`);
  const box = l.condition === "with the original box" ? "box" : l.condition === "without the box" ? "nobox" : "return";
  const title = box === "box" ? "Send it back with the box" : box === "nobox" ? "Send it back without the box" : "Send it back";
  return { icon: box, title, condition: capitalise(parts.join(", ")), figure: { kind: "money", cents: l.lossCents }, quotes: l.quotes, detailLabel: "Sending it back" };
}

/** Splits the row's lines into distinct cases (what you do, what it costs) and notes (terms that apply to all). */
function casesAndNotes(lines: ReturnLine[], window: ReturnWindow | null): { cases: Case[]; notes: Note[] } {
  const cases: Case[] = [];
  const notes: Note[] = [];
  const losses = lines.filter((l): l is Extract<ReturnLine, { kind: "loss" }> => l.kind === "loss").sort((a, b) => a.lossCents - b.lossCents);

  for (const l of lines) {
    if (l.kind !== "exchange") continue;
    const what = l.count === 1 ? "one free exchange" : l.count ? `${l.count} free exchanges` : "free exchanges";
    cases.push({
      icon: "swap",
      title: "Exchange it",
      condition: capitalise([what, l.conditions].filter(Boolean).join(", ")),
      figure: { kind: "free" },
      quotes: l.quotes,
      detailLabel: "Exchanging it",
    });
  }
  cases.push(...losses.map(lossCase));

  const fee = lines.find((l) => l.kind === "fee_unstated");
  const ship = lines.find((l) => l.kind === "return_shipping_unstated");
  const none = lines.find((l) => l.kind === "cost_unstated");
  if (losses.length === 0 && (fee || ship || none)) {
    // No figure: still one case, with the gap said plainly.
    const condition = none
      ? "Neither the policy nor the store's assistant says what a return costs."
      : fee && ship
        ? "You pay a restocking fee and return shipping. The store states neither amount."
        : fee
          ? "You pay a restocking fee. The store doesn't state the amount."
          : "You pay return shipping. The store doesn't state the amount.";
    const quotes = [...(fee?.quotes ?? []), ...(ship?.quotes ?? [])];
    cases.push({ icon: "return", title: "Send it back", condition, figure: { kind: "unstated", text: "Not stated" }, quotes: dedupe(quotes), detailLabel: "Sending it back" });
  } else if (ship) {
    notes.push({ text: <>Return shipping comes on top, <Gap>amount not stated</Gap>.</>, quotes: ship.quotes, detailLabel: "Return shipping" });
  }

  if (window) {
    const days = window.days !== null ? `${window.days} days` : "A return window";
    notes.push({
      text: window.starts ? <>{days} from {window.starts}.</> : <>{days}, <Gap>start not stated</Gap>.</>,
      quotes: window.quotes,
      detailLabel: "Return window",
    });
  }
  for (const l of lines) {
    if (l.kind === "final_sale") notes.push({ text: l.value ? "Final sale." : "Not final sale.", quotes: l.quotes, detailLabel: "Final sale" });
    if (l.kind === "delivery_refund_unstated") {
      const delivery = l.deliveryCents === null ? "delivery charges are" : `${formatUsd(l.deliveryCents)} delivery is`;
      notes.push({ text: <>The store <Gap>doesn't say</Gap> whether the {delivery} refunded.</>, quotes: l.quotes, detailLabel: "Delivery" });
    }
    if (l.kind === "disagreement") {
      notes.push({ text: <Gap>The policy and the store's assistant disagree on {l.topic}.</Gap>, quotes: l.quotes, detailLabel: capitalise(l.topic) });
    }
  }
  return { cases, notes };
}

function dedupe(quotes: Quote[]): Quote[] {
  const seen = new Set<string>();
  return quotes.filter((q) => (seen.has(q.source + q.text) ? false : (seen.add(q.source + q.text), true)));
}

// --- Rendering ----------------------------------------------------------------

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
    // Fail closed: the store's words, unfolded, and no figure.
    return (
      <>
        <p className="lead">I couldn't check my figures against the store's words, so here is what the store says instead.</p>
        <Quotes quotes={row.quotes} />
        <p className="breakdown unverified-reason">{row.reason}</p>
        <Details groups={casesAndNotes(row.lines, row.window).notes.map((n) => ({ label: n.detailLabel, quotes: n.quotes }))} open />
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

  const { cases, notes } = casesAndNotes(row.lines, row.window);
  return (
    <>
      <PolicyMissingNote sources={row.sources} />
      {cases.length > 1 && <p className="lead">What you pay depends on which of these you do:</p>}
      <ul className="cases">
        {cases.map((c, i) => (
          <li className="case" key={i}>
            <CaseIcon icon={c.icon} />
            <div className="case-text">
              <p className="case-title">{c.title}</p>
              <p className="case-condition">{c.condition}</p>
            </div>
            <FigureCell figure={c.figure} />
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <p className="returns-notes">
          {notes.map((n, i) => (
            <span key={i}>
              {i > 0 && " "}
              {n.text}
            </span>
          ))}
        </p>
      )}
      <Details groups={[...cases, ...notes].map((x) => ({ label: x.detailLabel, quotes: x.quotes }))} />
    </>
  );
}

function FigureCell({ figure }: { figure: Figure }) {
  if (figure.kind === "free") return <p className="case-figure case-free">Free</p>;
  if (figure.kind === "unstated") return <p className="case-figure case-unstated">{figure.text}</p>;
  return <p className="case-figure">{formatUsd(figure.cents)}</p>;
}

/** The store's exact words, one click away, grouped by case. Identical quote sets show once. */
function Details({ groups, open = false }: { groups: { label: string; quotes: Quote[] }[]; open?: boolean }) {
  const [shown, setShown] = useState(open);
  const merged: { label: string; quotes: Quote[] }[] = [];
  for (const g of groups) {
    if (g.quotes.length === 0) continue;
    const key = JSON.stringify(g.quotes);
    const same = merged.find((m) => JSON.stringify(m.quotes) === key);
    if (same) continue;
    const label = merged.find((m) => m.label === g.label) ? `${g.label}, more` : g.label;
    merged.push({ label, quotes: g.quotes });
  }
  if (merged.length === 0) return null;
  if (open) return <DetailList groups={merged} />;
  return (
    <>
      <button type="button" className="detail-toggle" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {shown ? "Hide detail" : "Read in detail"}
      </button>
      {shown && <DetailList groups={merged} />}
    </>
  );
}

function DetailList({ groups }: { groups: { label: string; quotes: Quote[] }[] }) {
  return (
    <div className="detail">
      {groups.map((g, i) => (
        <div className="detail-group" key={i}>
          <p className="detail-label">{g.label}</p>
          <Quotes quotes={g.quotes} />
        </div>
      ))}
    </div>
  );
}

function CaseIcon({ icon }: { icon: Icon }) {
  const paths: Record<Icon, React.ReactNode> = {
    swap: (
      <>
        <path d="M4 8h13l-3-3" />
        <path d="M20 16H7l3 3" />
      </>
    ),
    box: (
      <>
        <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
        <path d="M4 8l8 4 8-4M12 12v8" />
      </>
    ),
    nobox: (
      <>
        <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
        <path d="M3 3l18 18" />
      </>
    ),
    return: (
      <>
        <path d="M9 14l-5-5 5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </>
    ),
  };
  return (
    <svg className="case-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[icon]}
    </svg>
  );
}

function usesAssistant(row: IfWrongRow): boolean {
  if (row.status === "no_returns") return row.quote.source === "assistant";
  if (row.status === "unverified") return [...row.quotes, ...row.lines.flatMap((l) => l.quotes)].some((q) => q.source === "assistant");
  if (row.status !== "terms") return false;
  return [...row.lines.flatMap((l) => l.quotes), ...(row.window?.quotes ?? [])].some((q) => q.source === "assistant");
}

function SourceLabel({ row, seller }: { row: IfWrongRow; seller: string }) {
  const { policy } = row.sources;
  if (policy.status === "read") {
    return (
      <>
        From{" "}
        <a href={policy.url} target="_blank" rel="noopener noreferrer">
          {seller}'s refund policy
        </a>
        {usesAssistant(row) && ", with notes from the store's assistant"}
      </>
    );
  }
  return usesAssistant(row) ? <>From the store's assistant</> : <>The store's policy couldn't be read</>;
}

function PolicyMissingNote({ sources }: { sources: ReturnsSources }) {
  if (sources.policy.status === "read" || sources.assistant.status !== "answered") return null;
  return <p className="lead">I couldn't read the store's policy page, so these terms come from the store's assistant, an AI-written summary.</p>;
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
