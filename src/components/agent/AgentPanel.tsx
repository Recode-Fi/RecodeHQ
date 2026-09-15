"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAgent } from "./AgentContext";
import { CloseIcon } from "@/components/ui/icons";

/**
 * ============================================================
 * RECODE Agent — panel (global drawer, no navigation route)
 * ============================================================
 * Desktop: right-side drawer. Mobile: near-full-screen sheet.
 * Streams SSE from /api/agent with tool-call visibility, stop
 * support, quick actions and honest error states.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Client-side creation time (HH:MM display). */
  ts: number;
}

interface ToolChip {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
}

const QUICK_ACTIONS: { label: string; message: string }[] = [
  { label: "Analyze this asset", message: "Analyze the asset I'm currently viewing." },
  { label: "What's moving right now?", message: "What's moving right now? Top movers across RECODE markets." },
  { label: "Show whale activity", message: "Show recent whale activity for the current context." },
  { label: "Scan this contract", message: "Scan this contract." },
  { label: "Analyze this wallet", message: "Analyze this wallet." },
  { label: "Explain this signal", message: "Explain the intelligence signal for the current asset." },
  { label: "What changed in 24H?", message: "What changed in the last 24 hours for the current context?" },
];

let seq = 0;
const nextId = () => `m${Date.now()}_${++seq}`;

/** The ONLY error text ever shown to the user — the server normalizes
    every provider/network/tool failure into this wording. */
const USER_SAFE_ERROR = "Server is busy. Please try again shortly.";

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── Minimal markdown renderer (bold / code / lists / heads) ── */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}b${i}`} className="font-semibold text-text">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}c${i}`}
          className="rounded border border-line bg-panel-2 px-1 py-0.5 font-mono text-[11px] text-green"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const L = list;
    const items = L.items.map((it, i) => (
      <li key={`li${blocks.length}_${i}`} className="leading-relaxed">
        {renderInline(it, `li${blocks.length}_${i}`)}
      </li>
    ));
    blocks.push(
      L.ordered ? (
        <ol key={`l${blocks.length}`} className="ml-4 list-decimal space-y-1 text-[12.5px] text-muted">
          {items}
        </ol>
      ) : (
        <ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-1 text-[12.5px] text-muted">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      blocks.push(
        <p key={`h${blocks.length}`} className="pt-1 text-[12.5px] font-semibold tracking-wide text-text">
          {renderInline(h[2], `h${blocks.length}`)}
        </p>,
      );
      continue;
    }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (list && list.ordered) flushList();
      list ??= { ordered: false, items: [] };
      list.items.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      if (list && !list.ordered) flushList();
      list ??= { ordered: true, items: [] };
      list.items.push(ol[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") continue;
    blocks.push(
      <p key={`p${blocks.length}`} className="leading-relaxed text-[12.5px] text-muted">
        {renderInline(line, `p${blocks.length}`)}
      </p>,
    );
  }
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

/* ── Stream consumption + event handling ─────────────────── */

type AgentSseEvent = Record<string, unknown>;

function appendToken(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  id: string,
): (t: string) => void {
  return (t: string) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + t } : m)));
}

function handleAgentEvent(
  ev: AgentSseEvent,
  setChips: React.Dispatch<React.SetStateAction<ToolChip[]>>,
  setThinking: (v: boolean) => void,
  setError: (v: string | null) => void,
): void {
  switch (ev.type) {
    case "status":
      setThinking(ev.stage === "thinking");
      break;
    case "token":
      setThinking(false);
      break;
    case "tool_start":
      setThinking(false);
      setChips((prev) => [
        ...prev,
        { id: nextId(), name: String(ev.name ?? "tool"), ok: true, summary: "running…" },
      ]);
      break;
    case "tool_done": {
      const ok = Boolean(ev.ok);
      setChips((prev) =>
        prev.map((c) =>
          c.name === ev.name && c.summary === "running…"
            ? { ...c, ok, summary: String(ev.summary ?? "") }
            : c,
        ),
      );
      setThinking(true);
      break;
    }
    case "error":
      setThinking(false);
      setError(String(ev.message ?? "Agent error"));
      break;
    case "done":
      setThinking(false);
      break;
  }
}

/** Reads an SSE Response and dispatches tokens/events. */
async function consumeStream(
  res: Response,
  handlers: {
    onToken: (t: string) => void;
    onThought: (t: string) => void;
    onEvent: (ev: AgentSseEvent) => void;
  },
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      let ev: AgentSseEvent;
      try {
        ev = JSON.parse(line.slice(5).trim()) as AgentSseEvent;
      } catch {
        continue;
      }
      if (ev.type === "token") handlers.onToken(String(ev.text ?? ""));
      else if (ev.type === "thought") handlers.onThought(String(ev.text ?? ""));
      else handlers.onEvent(ev);
    }
  }
}

/* ── Panel component (state + streaming logic) ───────────── */


export function AgentPanel() {
  const { open, setOpen, getPageContext } = useAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<ToolChip[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thoughtText, setThoughtText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Agent backend status (honest state — no key probing). */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/agent/status", { cache: "no-store" });
        const j = (await res.json()) as { configured?: boolean };
        if (alive) setConfigured(Boolean(j.configured));
      } catch {
        if (alive) setConfigured(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  /* Auto-scroll while streaming (thought preview updates count too). */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chips, thinking, thoughtText]);

  /* Escape closes (desktop UX) while idle. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, streaming, setOpen]);

  const stop = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
  }, []);

  const clearConversation = useCallback(() => {
    stop();
    setMessages([]);
    setChips([]);
    setError(null);
    setThinking(false);
    setThoughtText("");
  }, [stop]);

  /** Core SSE send loop — streams tokens + tool visibility. */
  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || streaming) return;
      setError(null);
      setThinking(true);
      setThoughtText("");
      setStreaming(true);

      const history: { role: "user" | "assistant"; content: string }[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const userMsg: ChatMessage = { id: nextId(), role: "user", content: msg, ts: Date.now() };
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", ts: Date.now() },
      ]);
      setChips([]);
      setLastSent(msg);

      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ history, message: msg, context: getPageContext() }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          /* The server has already validated and normalized its own errors —
             raw status codes / bodies are never surfaced to the user. */
          throw new Error(USER_SAFE_ERROR);
        }
        await consumeStream(res, {
          onToken: appendToken(setMessages, assistantId),
          onThought: (t) => {
            setThinking(true);
            setThoughtText((prev) => (prev + t).slice(-600));
          },
          onEvent: (ev) => handleAgentEvent(ev, setChips, setThinking, setError),
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          /* Client-side network/socket/parse failures use the same
             normalized wording — no raw messages, no stack traces. */
          setError(USER_SAFE_ERROR);
        }
      } finally {
        ctrlRef.current = null;
        setStreaming(false);
        setThinking(false);
        /* Drop an assistant bubble that never received content. */
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content !== ""));
      }
    },
    [messages, streaming, getPageContext],
  );

  /** Re-send the last message after a failure (drops the failed bubble). */
  const retry = useCallback(() => {
    if (!lastSent || streaming) return;
    setError(null);
    setMessages((prev) => {
      const copy = [...prev];
      while (
        copy.length &&
        copy[copy.length - 1].role === "assistant" &&
        copy[copy.length - 1].content === ""
      ) {
        copy.pop();
      }
      if (copy.length && copy[copy.length - 1].content === lastSent) copy.pop();
      return copy;
    });
    void send(lastSent);
  }, [lastSent, streaming, send]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const t = input;
      setInput("");
      void send(t);
    },
    [input, send],
  );

  const empty = messages.length === 0;
  const canUse = configured !== false;

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-[2px]"
          onClick={() => {
            if (!streaming) setOpen(false);
          }}
          aria-hidden
        />
      ) : null}

      {/* Floating panel: anchored above the launcher on desktop,
          near-full-screen sheet on mobile. Never navigates away. */}
      <section
        aria-label="Recode Agent"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`agent-panel fixed z-[96] flex flex-col overflow-hidden border border-line bg-surface shadow-2xl max-md:inset-x-0 max-md:bottom-0 max-md:top-[calc(0.5rem+env(safe-area-inset-top))] max-md:rounded-t-2xl md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:right-[calc(1rem+env(safe-area-inset-right))] md:h-[min(640px,calc(100dvh-7rem))] md:w-[420px] md:rounded-2xl ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="border-b border-line bg-panel/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="agent-spark shrink-0 text-green" aria-hidden>
                ✦
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[13px] font-semibold tracking-wide text-text">
                    Recode Agent
                  </h2>
                  <span
                    className={`shrink-0 font-mono text-[9px] tracking-[0.14em] ${
                      configured ? "text-green" : "text-warn"
                    }`}
                    title={
                      configured
                        ? "AI backend connected — answers come from verified RECODE data"
                        : "AI backend not configured — add RECODE_AGENT_API_KEY to activate"
                    }
                  >
                    {configured ? "● AGENT ONLINE" : "○ AGENT OFFLINE"}
                  </span>
                </div>
                <p className="truncate text-[10.5px] text-faint">
                  AI-powered market &amp; on-chain intelligence
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={clearConversation}
                disabled={streaming}
                className="rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted transition-colors hover:text-text disabled:opacity-40"
                title="Start a new conversation"
              >
                New Chat
              </button>
              <button
                type="button"
                onClick={clearConversation}
                disabled={streaming}
                className="rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted transition-colors hover:text-text disabled:opacity-40"
                title="Clear the transcript"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!streaming) setOpen(false);
                }}
                className="rounded-[4px] border border-line bg-panel-2 p-1.5 text-muted transition-colors hover:text-text"
                aria-label="Close RECODE Agent"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {configured === false ? (
            <div className="mb-3 rounded-[4px] border border-line bg-panel px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
              <span className="font-semibold text-warn">Agent backend not configured.</span> Add{" "}
              <code className="rounded border border-line bg-panel-2 px-1 font-mono text-[10.5px] text-green">
                GEMINI_API_KEY
              </code>{" "}
              (or{" "}
              <code className="rounded border border-line bg-panel-2 px-1 font-mono text-[10.5px]">
                RECODE_AGENT_API_KEY
              </code>
              ) to the environment — locally in <code className="font-mono text-[10.5px]">.env.local</code>,
              in production via Vercel project settings — then redeploy.
            </div>
          ) : null}

          {empty ? <AgentWelcome onPick={(m) => void send(m)} disabled={!canUse} /> : null}

          <div className="space-y-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%]">
                    <div className="rounded-[10px] rounded-br-sm border border-line-strong bg-panel px-3 py-2 text-[12.5px] text-text">
                      {m.content}
                    </div>
                    <p className="tnum mt-1 text-right text-[9px] text-faint">{clockTime(m.ts)}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <span className="agent-spark mt-0.5 shrink-0 text-green" aria-hidden>
                    ✦
                  </span>
                  <div className="min-w-0 flex-1">
                    <Markdown text={m.content} />
                    {m.content ? (
                      <p className="tnum mt-1 text-[9px] text-faint">{clockTime(m.ts)}</p>
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>

          {chips.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {chips.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-[4px] border border-line bg-panel px-2.5 py-1.5 font-mono text-[10.5px] ${
                    c.ok ? "text-muted" : "text-warn"
                  }`}
                >
                  <span className={c.ok ? "text-green" : "text-warn"}>{c.ok ? "▸" : "✕"}</span>
                  <span className="font-semibold text-text">{c.name}</span>
                  <span className="truncate text-faint">{c.summary}</span>
                </div>
              ))}
            </div>
          ) : null}

          {thinking ? (
            <div className="mt-3 rounded-[4px] border border-line bg-panel px-3 py-2 font-mono text-[10px] leading-relaxed">
              <div className="flex items-center gap-2 text-faint">
                <span className="live-dot" />
                thinking…
              </div>
              {thoughtText ? (
                <p className="mt-1.5 max-h-24 overflow-hidden whitespace-pre-wrap border-l border-line pl-2 text-muted">
                  {thoughtText}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-[4px] border border-line bg-panel px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
              {error}
              {lastSent && !streaming ? (
                <button
                  type="button"
                  onClick={retry}
                  className="ml-2 rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted transition-colors hover:text-text"
                >
                  RETRY
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Input */}
        <form onSubmit={onSubmit} className="border-t border-line bg-panel/60 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              rows={1}
              disabled={!canUse || streaming}
              placeholder={canUse ? "Ask RECODE Agent…" : "Agent backend not configured"}
              className="max-h-32 min-h-[38px] flex-1 resize-none rounded-[4px] border border-line bg-panel px-3 py-2 text-[12.5px] text-text placeholder:text-faint focus:border-line-strong focus:outline-none disabled:opacity-50"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="h-[38px] shrink-0 rounded-[4px] border border-line bg-panel-2 px-3 text-[11.5px] font-semibold text-warn transition-colors hover:text-text"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canUse || !input.trim()}
                className="h-[38px] shrink-0 rounded-[4px] border border-line-strong bg-panel-2 px-3.5 text-[11.5px] font-semibold text-text transition-colors hover:border-green hover:text-green disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-faint">
            RECODE Agent answers only from verified RECODE data (LIVE · CALCULATED · HISTORICAL ·
            UNKNOWN · UNAVAILABLE). Not investment advice.
          </p>
        </form>
      </section>
    </>
  );
}

/* ── Empty-state welcome + quick actions ─────────────────── */

function AgentWelcome({
  onPick,
  disabled,
}: {
  onPick: (message: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="rounded-[4px] border border-line bg-panel px-3.5 py-3">
        <p className="text-[12.5px] leading-relaxed text-muted">
          <span className="agent-spark mr-1.5 text-green" aria-hidden>
            ✦
          </span>
          Connected to the RECODE data plane — market sync, asset intelligence, contract scanner,
          wallet intelligence and whale flows. Every number I cite is verified; what RECODE cannot
          prove, I mark unavailable.
        </p>
      </div>
      <p className="mb-2 mt-4 font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
        Quick intelligence
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={disabled}
            onClick={() => onPick(a.message)}
            className="group flex items-center gap-2 rounded-[4px] border border-line bg-panel px-3 py-2 text-left text-[11.5px] text-muted transition-colors hover:border-line-strong hover:text-text disabled:opacity-40"
          >
            <span className="text-green transition-transform group-hover:scale-110" aria-hidden>
              ✦
            </span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

