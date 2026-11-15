import type { CheckStep } from "../../shared/card";

const MARK: Record<CheckStep["outcome"], string> = { ok: "✓", empty: "–", failed: "✕" };
const SAID: Record<CheckStep["outcome"], string> = { ok: "Done", empty: "Nothing found", failed: "Failed" };

export function HowIChecked({ steps }: { steps: CheckStep[] }) {
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
                {s.title} <code>{s.call}</code>
              </p>
              <p className="step-summary">{s.summary}</p>
              {s.detail && <p className="step-detail">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
