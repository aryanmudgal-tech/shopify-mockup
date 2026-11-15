// Guardrail 1 (spec 8.2): a quote counts only if it is an exact substring of
// the text it claims to come from, after whitespace normalisation. A value
// whose quote fails is treated as unknown.

import type { Quote, ReturnsSources } from "../shared/card";

export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function sourceText(sources: ReturnsSources, source: Quote["source"]): string | null {
  if (source === "policy") return sources.policy.status === "read" ? sources.policy.text : null;
  return sources.assistant.status === "answered" ? sources.assistant.text : null;
}

export function quoteHolds(quote: Quote, sources: ReturnsSources): boolean {
  const text = sourceText(sources, quote.source);
  return text !== null && quote.text.trim() !== "" && squash(text).includes(squash(quote.text));
}

export function allQuotesHold(quotes: Quote[], sources: ReturnsSources): boolean {
  return quotes.every((q) => quoteHolds(q, sources));
}
