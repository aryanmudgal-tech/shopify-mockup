import type { CheckStep } from "../../shared/card";

const MARK: Record<CheckStep["outcome"], string> = { ok: "✓", empty: "–", failed: "✕" };
const SAID: Record<CheckStep["outcome"], string> = { ok: "Done", empty: "Nothing found", failed: "Failed" };

export function HowIChecked({ steps }: { steps: CheckStep[] }) {
  if (!steps.length) return null;
  return (
    <details className="checked">
      <summary>How I checked</summary>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.id} className={`step step-${s.outcome}`}>
            <span className="step-mark" aria-label={SAID[s.outcome]}>
              {MARK[s.outcome]}
            </span>
            <div>
              <p className="step-title">
                {s.title}
                <span className="step-call">
                  {s.tool ? (
                    <>
                      <code>{s.tool}</code> on {s.endpoint}
                    </>
                  ) : (
                    s.endpoint
                  )}
                </span>
              </p>
              <p className="step-summary">{s.summary}</p>
              {s.detail?.kind === "policy" && (
                <div className="step-detail step-policy" tabIndex={0} aria-label="The store's refund policy text">
                  {s.detail.text}
                </div>
              )}
              {s.detail?.kind === "assistant" && (
                <p className="step-detail step-assistant">
                  <span className="assistant-label">The store's assistant:</span> {s.detail.text}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
