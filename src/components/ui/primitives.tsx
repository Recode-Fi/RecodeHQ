"use client";

import type { ReactNode } from "react";
import type { DataStatus } from "@/lib/types";
import { statusWord } from "@/lib/format";

/* ---------------------------------------------------------- Layout blocks */

export function Panel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[6px] border border-line bg-panel ${padded ? "p-4" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h2>
        {sub ? <p className="mt-0.5 text-[11px] text-faint">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-green/80">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">{title}</h1>
        {sub ? <p className="mt-1 max-w-2xl text-[12.5px] text-muted">{sub}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </header>
  );
}

/* ---------------------------------------------------------- Status */

const STATUS_TONE: Record<DataStatus, string> = {
  live: "border-green/30 bg-green-soft text-green",
  syncing: "border-line bg-panel-2 text-warn",
  connecting: "border-line bg-panel-2 text-warn",
  stale: "border-warn/30 bg-warn/10 text-warn",
  unavailable: "border-line bg-panel-2 text-faint",
  unconfigured: "border-line bg-panel-2 text-faint",
};

export function DataBadge({ status, label }: { status: DataStatus; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${STATUS_TONE[status]}`}
    >
      {status === "live" ? <span className="live-dot" /> : null}
      {label ?? statusWord(status)}
    </span>
  );
}

export function Chip({
  children,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-green/40 bg-green-soft text-green"
          : "border-line bg-panel-2 text-muted hover:border-line hover:text-text"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {children}
    </Comp>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "pos" | "neg" | "warn" | "green";
}) {
  const tones = {
    neutral: "border-line bg-panel-2 text-muted",
    pos: "border-green/25 bg-green-soft text-green",
    neg: "border-neg/25 bg-neg/10 text-neg",
    warn: "border-warn/25 bg-warn/10 text-warn",
    green: "border-green/40 bg-green-soft text-green",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
