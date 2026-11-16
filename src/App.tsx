import { useEffect, useRef, useState } from "react";
import type { Card as CardModel, CheckResponse, DataMode } from "../shared/card";
import { formatUsd } from "../shared/money";
import { Card, type HandoffKind } from "./ui/Card";
import { shortDate, shortLink } from "./ui/format";

// The scripted assistant thread from spec 6.1. There is no open chat: the
// input takes a product link, then a ZIP, and nothing else.

type Message =
  | { id: number; from: "buyer"; text: string; link?: string }
  | { id: number; from: "assistant"; text: string; status?: boolean }
  | { id: number; from: "assistant"; card: CardModel };

type NewMessage = Message extends infer M ? (M extends Message ? Omit<M, "id"> : never) : never;

type Stage = "link" | "zip" | "checking";

interface Config {
  mode: DataMode;
  recordedAt: string | null;
  demoLinks: string[];
}

const OPENING: Message[] = [
  { id: 1, from: "buyer", text: "Found this sofa on ChatGPT, should I buy it?" },
  { id: 2, from: "assistant", text: "Paste the link and I'll check it before you pay." },
];

let nextId = 3;

/** How long the recorded demo shows "Checking…", so the take doesn't look canned. */
const RECORDED_PACE_MS = 1600;

export function App() {
  const [messages, setMessages] = useState<Message[]>(OPENING);
  const [stage, setStage] = useState<Stage>("link");
  const [zip, setZip] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    // A new card scrolls so the line introducing it sits at the top; anything
    // else just keeps the newest message in view.
    const last = messages[messages.length - 1];
    const newest = endRef.current?.previousElementSibling;
    const target = last && "card" in last ? newest?.previousElementSibling : newest;
    target?.scrollIntoView({ behavior: "smooth", block: last && "card" in last ? "start" : "end" });
  }, [messages]);

  const say = (m: NewMessage) => setMessages((ms) => [...ms, { ...m, id: nextId++ } as Message]);

  async function check(link: string, forZip: string) {
    setStage("checking");
    const started = performance.now();
    const statusId = nextId++;
    setMessages((ms) => [
      ...ms,
      {
        id: statusId,
        from: "assistant",
        status: true,
        text: `Checking Shopify's catalog, a cart for ${forZip}, the store's samples, its refund policy and its assistant…`,
      },
    ]);
    let reply: Message[];
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, zip: forZip }),
      });
      const body = (await res.json()) as CheckResponse;
      reply = body.ok
        ? [
            { id: nextId++, from: "assistant", text: `Here's what it costs delivered to ${forZip}, and where each figure comes from.` },
            { id: nextId++, from: "assistant", card: body.card },
          ]
        : [{ id: nextId++, from: "assistant", text: body.error.message }];
    } catch {
      reply = [{ id: nextId++, from: "assistant", text: "I couldn't reach the server. Is it still running?" }];
    }
    // Recorded answers come back at once; hold the status line long enough to read on video.
    if (config?.mode === "recorded") await new Promise((r) => setTimeout(r, Math.max(0, RECORDED_PACE_MS - (performance.now() - started))));
    setMessages((ms) => [...ms.filter((m) => m.id !== statusId), ...reply]);
    setStage("link");
    inputRef.current?.focus();
  }

  /** After a hand-off, say what opened, so the thread records it. */
  function handoff(kind: HandoffKind, card: CardModel) {
    const seller = card.product.seller.name;
    const h = card.handoffs[kind];
    const what =
      kind === "sample" && card.tryFirst.status === "sample"
        ? `the ${card.tryFirst.title} sample${h?.kind === "checkout" ? ` (${formatUsd(card.tryFirst.priceCents)})` : ""}`
        : `the ${shortTitle(card.product.title)}${h?.kind === "checkout" ? ` (${formatUsd(card.product.listedCents)})` : ""}`;
    const text =
      h?.kind === "product_page"
        ? `Opened ${seller}'s product page for ${what} in a new tab. You buy there; nothing is charged here.`
        : `Opened ${seller}'s checkout for ${what} in a new tab. Nothing is charged until you pay there.`;
    say({ from: "assistant", text });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || stage === "checking") return;

    if (stage === "link") {
      if (!isLink(value)) return setHint("Paste a product link that starts with https://");
      setHint(null);
      setInput("");
      say({ from: "buyer", text: shortLink(value), link: value });
      if (zip) return void check(value, zip);
      setPendingLink(value);
      setStage("zip");
      say({ from: "assistant", text: "What ZIP will this be delivered to?" });
      return;
    }

    if (!/^\d{5}$/.test(value)) return setHint("A US ZIP code is five digits, like 14228.");
    setHint(null);
    setInput("");
    setZip(value);
    say({ from: "buyer", text: value });
    if (pendingLink) void check(pendingLink, value);
  }

  return (
    <div className="page">
      <main className="thread" aria-live="polite">
        {messages.map((m) =>
          "card" in m ? (
            <div key={m.id} className="msg msg-card">
              <Card card={m.card} onHandoff={(kind) => handoff(kind, m.card)} />
            </div>
          ) : m.from === "buyer" ? (
            <p key={m.id} className="msg msg-buyer" title={m.link}>
              {m.text}
            </p>
          ) : (
            <p key={m.id} className={m.status ? "msg msg-assistant msg-status" : "msg msg-assistant"}>
              {m.text}
            </p>
          ),
        )}
        <div ref={endRef} />
      </main>

      <div className="composer">
        <form onSubmit={submit} className="composer-form">
          <label className="visually-hidden" htmlFor="composer-input">
            {stage === "zip" ? "ZIP code" : "Product link"}
          </label>
          <input
            id="composer-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={stage === "zip" ? "ZIP code" : "Paste a product link"}
            inputMode={stage === "zip" ? "numeric" : "url"}
            autoComplete="off"
            disabled={stage === "checking"}
            aria-describedby={hint ? "composer-hint" : undefined}
          />
          <button type="submit" disabled={stage === "checking"}>
            Send
          </button>
        </form>
        {hint && (
          <p id="composer-hint" className="composer-hint">
            {hint}
          </p>
        )}
        <ModeFooter config={config} onPick={(link) => { setInput(link); inputRef.current?.focus(); }} />
      </div>
    </div>
  );
}

/** ?clean hides the shortcuts for a screen recording; the data-mode label always stays (spec 9). */
const CLEAN = new URLSearchParams(location.search).has("clean");

function ModeFooter({ config, onPick }: { config: Config | null; onPick: (link: string) => void }) {
  if (!config) return null;
  return (
    <footer className="mode">
      <span>
        {config.mode === "recorded" && config.recordedAt
          ? `Recorded Shopify responses from ${shortDate(config.recordedAt)}`
          : config.mode === "live"
            ? "Live Shopify calls"
            : "Mock data"}
      </span>
      {!CLEAN && config.demoLinks.length > 0 && (
        <span className="demo-links">
          Demo links:
          {config.demoLinks.map((l) => (
            <button key={l} type="button" onClick={() => onPick(l)}>
              {new URL(l).hostname.replace(/^www\./, "")}
            </button>
          ))}
        </span>
      )}
      {!CLEAN && <a href="?states">Empty states</a>}
    </footer>
  );
}

/** "Garvee 137\" Modular Sectional Sofa" from a long marketplace title. */
function shortTitle(title: string): string {
  const first = title.split(",")[0]!.trim();
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}

function isLink(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
