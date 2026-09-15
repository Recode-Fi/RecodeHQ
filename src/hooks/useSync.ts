"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataStatus } from "@/lib/types";
import type { EngineStatus } from "@/server/sync/types";
import type { LiveOverview } from "@/server/sync/analyticsService";
import { recodeService, type LiveMarketRow, type LiveIntelligence } from "@/services/recodeService";

export interface SyncPoll<T> {
  data: T | null;
  status: DataStatus;
  lastUpdated: number | null;
  refresh: () => void;
}

/**
 * Visibility-aware polling: pauses while the tab is hidden so live
 * surfaces never burn resources in the background.
 */
export function useSyncPolling<T>(path: string, intervalMs: number): SyncPoll<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<DataStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      await Promise.resolve();
      try {
        const res = await fetch(path, { signal, cache: "no-store" });
        if (!res.ok) {
          setStatus("unavailable");
          return;
        }
        const json = (await res.json()) as { status?: string; data?: T };
        if (json.status === "live" && json.data != null) {
          setData(json.data);
          setStatus("live");
          setLastUpdated(Date.now());
        } else if (json.status === "stale") {
          setData(json.data ?? null);
          setStatus("stale");
        } else {
          setStatus("syncing");
        }
      } catch {
        if (!signal.aborted) setStatus("unavailable");
      }
    },
    [path],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const boot = setTimeout(() => {
      void load(ctrl.signal);
    }, 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(ctrl.signal);
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(ctrl.signal);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(boot);
      ctrl.abort();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, intervalMs, load]);

  const refresh = useCallback(() => {
    void load(new AbortController().signal);
  }, [load]);

  return { data, status, lastUpdated, refresh };
}

export function useEngineStatus(): SyncPoll<EngineStatus> {
  return useSyncPolling<EngineStatus>("/api/sync/status", 5_000);
}

export function useLiveOverview(): SyncPoll<LiveOverview> {
  return useSyncPolling<LiveOverview>("/api/sync/overview", 15_000);
}

export function useLiveMarkets(tf: string = "24H"): SyncPoll<LiveMarketRow[]> {
  return useSyncPolling<LiveMarketRow[]>(`/api/sync/markets?tf=${encodeURIComponent(tf)}`, 15_000);
}

/** symbol → resolved asset logo URL, for feeds/lists keyed by symbol. */
export function useAssetLogos(): Map<string, string | null> {
  const { data } = useLiveMarkets("24H");
  return useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of data ?? []) {
      const sym = (row.symbol ?? "").toUpperCase();
      if (sym) map.set(sym, row.logoUrl);
    }
    return map;
  }, [data]);
}

/** Deterministic intelligence scores for one asset (server-computed). */
export function useIntelligence(symbol: string): SyncPoll<LiveIntelligence> {
  return useSyncPolling<LiveIntelligence>(
    `/api/sync/intelligence?symbol=${encodeURIComponent(symbol)}`,
    30_000,
  );
}

/** One-shot async data fetch with explicit status handling. */
export function useAsyncData<T>(
  fetcher: () => Promise<{ status: string; data: T | null; error?: string }>,
  deps: unknown[],
): { data: T | null; status: DataStatus; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<DataStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setStatus("connecting");
    (async () => {
      const res = await fetcher();
      if (!alive) return;
      if (res.status === "live" && res.data != null) {
        setData(res.data);
        setStatus("live");
        setError(null);
      } else if (res.status === "error") {
        setData(null);
        setStatus("unavailable");
        setError(res.error ?? "Request failed");
      } else {
        setData(null);
        setStatus("syncing");
        setError(res.error ?? null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, status, error, reload };
}
