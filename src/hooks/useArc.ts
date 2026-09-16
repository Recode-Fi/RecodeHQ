"use client";

import { useEffect, useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import {
  arcService,
  type ArcEngineStatus,
  type ArcMarketRow,
  type ArcRadarSignal,
  type ArcSmartMoneyWallet,
  type ArcStablecoinData,
  type ArcTokenIntel,
  type ArcWalletActivity,
  type ArcWalletBalances,
  type ArcWhaleEvent,
} from "@/services/arcService";

/** Arc data hooks — same polling semantics as the Solana/EVM hooks. */

export function useArcStatus(): { data: ArcEngineStatus | null; status: string } {
  const poll = useSyncPolling<ArcEngineStatus>("/api/arc/status", 15_000);
  return { data: poll.data, status: poll.status };
}

export function useArcMarkets(): { data: ArcMarketRow[] | null; status: string } {
  const poll = useSyncPolling<ArcMarketRow[]>("/api/arc/markets", 15_000);
  return { data: poll.data, status: poll.status };
}

export function useArcWhales(): { data: ArcWhaleEvent[] | null; status: string } {
  const poll = useSyncPolling<ArcWhaleEvent[]>("/api/arc/whales", 20_000);
  return { data: poll.data, status: poll.status };
}

export function useArcRadar(): { data: ArcRadarSignal[] | null; status: string } {
  const poll = useSyncPolling<ArcRadarSignal[]>("/api/arc/radar", 20_000);
  return { data: poll.data, status: poll.status };
}

export function useArcSmartMoney(
  windowHours = 24,
): { data: ArcSmartMoneyWallet[] | null; status: string } {
  const poll = useSyncPolling<ArcSmartMoneyWallet[]>(
    `/api/arc/smart-money?windowHours=${windowHours}`,
    20_000,
  );
  return { data: poll.data, status: poll.status };
}

export function useArcStablecoin(wallet?: string): {
  data: ArcStablecoinData | null;
  status: string;
} {
  const path = `/api/arc/stablecoin${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ""}`;
  const poll = useSyncPolling<ArcStablecoinData>(path, 20_000);
  return { data: poll.data, status: poll.status };
}

/** One-shot direct contract lookup (search-action driven, never per keystroke). */
export function useArcDirectLookup(address: string | null): {
  data: ArcTokenIntel | null;
  status: string;
  error: string | null;
} {
  const [state, setState] = useState<{
    data: ArcTokenIntel | null;
    status: string;
    error: string | null;
  }>({ data: null, status: "idle", error: null });

  useEffect(() => {
    if (!address) {
      setState({ data: null, status: "idle", error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, status: "loading", error: null });
    arcService
      .token(address)
      .then((res) => {
        if (cancelled) return;
        setState({
          data: res.data,
          status: res.status,
          error: res.error ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, status: "unavailable", error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return state;
}

export function useArcWallet(address: string): {
  balances: ArcWalletBalances | null;
  activity: ArcWalletActivity | null;
  status: string;
} {
  const [balances, setBalances] = useState<ArcWalletBalances | null>(null);
  const [activity, setActivity] = useState<ArcWalletActivity | null>(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setStatus("loading");
    Promise.all([arcService.walletBalances(address), arcService.walletActivity(address)])
      .then(([b, a]) => {
        if (cancelled) return;
        setBalances(b.data);
        setActivity(a.data);
        setStatus(b.status);
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { balances, activity, status };
}