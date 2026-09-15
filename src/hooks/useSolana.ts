"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import {
  solanaService,
  type LiveSolanaRow,
  type SolanaEngineStatus,
  type SolanaRadarSignal,
  type SolanaScanRow,
  type SolanaSmartMoneyWallet,
  type SolanaTokenIntel,
  type SolanaWalletActivity,
  type SolanaWalletBalances,
  type SolanaWhaleEvent,
} from "@/services/solanaService";

/**
 * Solana data hooks — same polling semantics as the EVM useSync hooks
 * (visibility-aware, honest status), pointed at the Solana API surface.
 */

export function useSolanaStatus(): { data: SolanaEngineStatus | null; status: string } {
  const poll = useSyncPolling<SolanaEngineStatus>("/api/solana/status", 15_000);
  return { data: poll.data, status: poll.status };
}

export function useSolanaMarkets(): { data: LiveSolanaRow[] | null; status: string } {
  const poll = useSyncPolling<LiveSolanaRow[]>("/api/solana/markets", 15_000);
  return { data: poll.data, status: poll.status };
}

export function useSolanaScanner(): { data: SolanaScanRow[] | null; status: string } {
  const poll = useSyncPolling<SolanaScanRow[]>("/api/solana/scanner", 15_000);
  return { data: poll.data, status: poll.status };
}

export function useSolanaSmartMoney(
  windowHours = 24,
): { data: SolanaSmartMoneyWallet[] | null; status: string } {
  const poll = useSyncPolling<SolanaSmartMoneyWallet[]>(
    `/api/solana/smart-money?windowHours=${windowHours}`,
    20_000,
  );
  return { data: poll.data, status: poll.status };
}

export interface SolanaDirectLookupData {
  chain: "solana";
  direct: boolean;
  token: {
    mint: string;
    symbol: string | null;
    name: string | null;
    logoUrl: string | null;
    decimals: number | null;
    priceUsd: number | null;
    marketCap: number | null;
    fdv: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    change24hPct: number | null;
    buys24h: number | null;
    sells24h: number | null;
    txns24h: number | null;
    dexId: string | null;
    pairAddress: string | null;
    pairCreatedAt: number | null;
    supply: number | null;
    sources: string[];
  };
  metadata: {
    name: string | null;
    symbol: string | null;
    logoUrl: string | null;
    decimals: number | null;
    supply: number | null;
  };
  holders: {
    top: {
      address: string | null;
      tokenAccount: string;
      balance: number | null;
      sharePct: number | null;
      usd: number | null;
    }[];
    updatedAt: number;
  } | null;
  concentration: { top10: number | null; coverage: number; basis: string };
  holdersTotal: null;
  pairs: {
    dexId: string | null;
    pairAddress: string | null;
    quoteToken: string | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    pairCreatedAt: number | null;
  }[];
  pairsTotal: number;
  whales: { id: string; kind: string; usd: number | null; observedAt: number }[];
  errors: string[];
  priceBasis: string | null;
  dataStatus: "live";
  resolvedAt: number;
}

export type DirectLookupState =
  | { phase: "idle" }
  | { phase: "resolving"; mint: string }
  | { phase: "found"; mint: string; data: SolanaDirectLookupData }
  | { phase: "no-market"; mint: string; metadata: SolanaDirectLookupData["metadata"] | null }
  | { phase: "not-found"; mint: string }
  | { phase: "invalid"; input: string }
  | { phase: "error"; mint: string; message: string };

/**
 * Direct Solana mint lookup — one provider-resolving fetch per search
 * action (Enter/submit, never per keystroke). Validates offline first
 * (base58 + 32-byte checksum) so invalid input costs zero provider calls.
 */
export function useDirectToken(mint: string | null) {
  const [state, setState] = useState<DirectLookupState>({ phase: "idle" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!mint) {
      setState({ phase: "idle" });
      return;
    }
    let alive = true;
    setState({ phase: "resolving", mint });
    (async () => {
      try {
        const res = await fetch(`/api/solana/token/${encodeURIComponent(mint)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          status: string;
          data: SolanaDirectLookupData | { chain: string; mint: string; metadata: SolanaDirectLookupData["metadata"]; pairsTotal: number } | null;
          error?: string;
          reason?: string;
        };
        if (!alive) return;
        if (res.status === 400) {
          setState({ phase: "invalid", input: mint });
          return;
        }
        if (json.status === "empty" && json.reason === "no-market") {
          const d = json.data as { metadata: SolanaDirectLookupData["metadata"] } | null;
          setState({ phase: "no-market", mint, metadata: d?.metadata ?? null });
          return;
        }
        if (json.status === "empty") {
          setState({ phase: "not-found", mint });
          return;
        }
        if (json.data && json.status !== "error") {
          setState({ phase: "found", mint, data: json.data as SolanaDirectLookupData });
          return;
        }
        setState({
          phase: "error",
          mint,
          message: json.error ?? "Token not found or unavailable from current providers.",
        });
      } catch {
        if (alive) setState({ phase: "error", mint, message: "Lookup request failed." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [mint, tick]);

  return { state, refresh };
}

export function useSolanaToken(mint: string): { data: SolanaTokenIntel | null; status: string } {
  const poll = useSyncPolling<SolanaTokenIntel>(
    `/api/solana/token/${encodeURIComponent(mint)}`,
    15_000,
  );
  return { data: poll.data, status: poll.status };
}

export function useSolanaWhales(): { data: SolanaWhaleEvent[] | null; status: string } {
  const poll = useSyncPolling<SolanaWhaleEvent[]>("/api/solana/whales", 20_000);
  return { data: poll.data, status: poll.status };
}

export function useSolanaRadar(): { data: SolanaRadarSignal[] | null; status: string } {
  const poll = useSyncPolling<SolanaRadarSignal[]>("/api/solana/radar", 30_000);
  return { data: poll.data, status: poll.status };
}

export function useSolanaWalletBalances(
  address: string,
): { data: SolanaWalletBalances | null; status: string } {
  const poll = useSyncPolling<SolanaWalletBalances>(
    `/api/solana/wallet/balances?address=${encodeURIComponent(address)}`,
    60_000,
  );
  return { data: poll.data, status: poll.status };
}

export function useSolanaWalletActivity(
  address: string,
): { data: SolanaWalletActivity | null; status: string } {
  const poll = useSyncPolling<SolanaWalletActivity>(
    `/api/solana/wallet/activity?address=${encodeURIComponent(address)}`,
    30_000,
  );
  return { data: poll.data, status: poll.status };
}