"use client";

import type { ReactNode } from "react";
import type { DataStatus } from "@/lib/types";

/* ---------------------------------------------------------- Metrics */

export function MetricCard({
  label,
  children,
  sub,
  status,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  status?: DataStatus;
}) {
  return (
    <div className="rounded-[6px] border border-line bg-panel p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        {status ? null : null}
      </div>
      <div className="tnum mt-2 text-lg font-semibold text-text">{children}</div>
      {sub ? <div className="mt-1 text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

/** Value cell that renders honest states instead of fabricated numbers. */
export function Value({
  children,
  unavailable = false,
  className = "",
}: {
  children: ReactNode;
  unavailable?: boolean;
  className?: string;
}) {
  if (unavailable) {
    return <span className={`tnum text-[11px] text-faint ${className}`}>Data unavailable</span>;
  }
  return <span className={`tnum ${className}`}>{children}</span>;
}

/* ---------------------------------------------------------- States */

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[6px] border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[6px] border border-line bg-panel-2">
        <div className="h-1.5 w-1.5 rounded-full bg-faint" />
      </div>
      <h3 className="text-[13px] font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-md text-[12px] text-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-panel-2 ${className}`} />;
}

export function SkeletonValue({ w = "w-16" }: { w?: string }) {
  return <span className={`tnum inline-block h-3.5 ${w} animate-pulse rounded bg-panel-2`} />;
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="mt-8 border-t border-line-soft pt-3 text-[10.5px] leading-relaxed text-faint">
      {children}
    </p>
  );
}

export function ProgressBar({
  pct,
  tone = "green",
}: {
  pct: number;
  tone?: "green" | "warn" | "neg";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const bg = tone === "green" ? "bg-green" : tone === "warn" ? "bg-warn" : "bg-neg";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-panel-2">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).catch(() => undefined);
      }}
      className="rounded-[4px] border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-text"
      title={label}
    >
      {label}
    </button>
  );
}
