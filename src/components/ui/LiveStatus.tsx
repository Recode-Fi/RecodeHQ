"use client";

/**
 * Live-status primitives — isolated-tick clock + honest status badges.
 * The clock lives INSIDE these small components so a 1s tick never
 * re-renders a whole table: heavy surfaces only re-render when their
 * data payload changes (15–20s provider cadence).
 */

import { useEffect, useState } from "react";
import { DataBadge } from "@/components/ui/primitives";
import { updatedSecondsAgo } from "@/lib/market-math";
import type { DataStatus } from "@/lib/types";

/** Ticking now() at the given cadence (default 1s). */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "Updated 12s ago" — seconds granularity is intentional: the Robinhood
 * Stock Token price API is cached server-side for ~15s, so finer precision
 * would overstate freshness.
 */
export function UpdatedAgo({
  ts,
  prefix = "Updated",
  className = "",
}: {
  ts: number | null | undefined;
  prefix?: string;
  className?: string;
}) {
  const now = useNow();
  if (ts == null) {
    return (
      <span className={`text-faint ${className}`}>Awaiting data</span>
    );
  }
  const label = updatedSecondsAgo(ts, now) ?? "—";
  return (
    <span className={`tnum text-faint ${className}`}>
      {prefix} {label}
    </span>
  );
}

/**
 * LIVE / CONNECTING / SYNCING / STALE / ERROR pill in the existing
 * DataBadge visual language. `unavailable` renders as ERROR when the
 * request itself failed; pass keepUnavailable to show UNAVAILABLE
 * (provider has no data) instead.
 */
export function LiveStatusBadge({
  status,
  label,
}: {
  status: DataStatus;
  label?: string;
}) {
  return (
    <DataBadge
      status={status}
      label={label ?? (status === "unavailable" ? "ERROR" : undefined)}
    />
  );
}
