"use client";

import { useAgent } from "./AgentContext";

/**
 * ============================================================
 * RECODE Agent — floating button (global, bottom-right)
 * ============================================================
 * A polished "chat with us" style launcher, RECODE-branded.
 * Fixed to the bottom-right corner, always visible while
 * scrolling, mounted once at the root layout so it exists on
 * every page — never a sidebar tab or navigation route.
 */
export function AgentButton() {
  const { open, toggle } = useAgent();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Open Recode Agent — AI market and on-chain intelligence"
      title="Recode Agent — AI market & on-chain intelligence"
      className={`agent-fab fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-bottom))] z-[85] flex h-11 items-center gap-2 rounded-full border px-4 text-[12.5px] font-semibold shadow-lg transition-all duration-200 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] ${
        open
          ? "border-green/60 bg-panel text-green"
          : "border-line-strong bg-panel text-text hover:-translate-y-0.5 hover:border-green/60 hover:text-green hover:shadow-xl"
      }`}
    >
      <span className="agent-spark text-[13px] leading-none" aria-hidden>
        ✦
      </span>
      <span className="whitespace-nowrap">Recode Agent</span>
      <span
        className={`ml-0.5 h-1.5 w-1.5 rounded-full transition-colors ${
          open ? "bg-green" : "bg-warn"
        }`}
        aria-hidden
      />
    </button>
  );
}
