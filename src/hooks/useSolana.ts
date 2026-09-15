"use client";

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