import type { LiveSolanaRow, SolanaEngineStatus, SolanaRadarSignal, SolanaToken, SolanaWhaleEvent } from "@/server/solana/types";
import type { SolanaWalletActivity, SolanaWalletBalances } from "@/server/solana/services/walletIntel";

/**
 * ============================================================
 * Client bridge to the Solana intelligence layer.
 * Chain identity is explicit on every payload ("solana");
 * an empty engine yields "syncing" so callers render honest
 * loading/unavailable states — never placeholder numbers.
 * ============================================================
 */

export interface SolanaEnvelope<T> {
  status: "live" | "stale" | "syncing" | "unavailable" | "empty" | "error";
  data: T | null;
  error?: string;
}

/** Solana token detail (mint-address intelligence surface). */
export interface SolanaTokenIntel {
  chain: "solana";
  token: SolanaToken;
  holders: {
    mint: string;
    symbol: string | null;
    supply: number | null;
    top: {
      address: string | null;
      tokenAccount: string;
      balance: number | null;
      sharePct: number | null;
      usd: number | null;
    }[];
    updatedAt: number;
  } | null;
  whales: SolanaWhaleEvent[];
  sparkline: number[];
  dataStatus: "live" | "stale" | "unavailable";
  concentration: { top10: number | null; coverage: number; basis: string };
  priceBasis: string | null;
}

async function getJson<T>(path: string): Promise<SolanaEnvelope<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: "unavailable", data: null, error: body?.error };
    }
    return (await res.json()) as SolanaEnvelope<T>;
  } catch {
    return { status: "unavailable", data: null };
  }
}

export const solanaService = {
  status(): Promise<SolanaEngineStatus | null> {
    return (async () => {
      try {
        const res = await fetch("/api/solana/status", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as SolanaEngineStatus;
      } catch {
        return null;
      }
    })();
  },

  markets(): Promise<SolanaEnvelope<LiveSolanaRow[]>> {
    return getJson<LiveSolanaRow[]>("/api/solana/markets");
  },

  token(mint: string): Promise<SolanaEnvelope<SolanaTokenIntel>> {
    return getJson<SolanaTokenIntel>(`/api/solana/token/${encodeURIComponent(mint)}`);
  },

  whales(): Promise<SolanaEnvelope<SolanaWhaleEvent[]>> {
    return getJson<SolanaWhaleEvent[]>("/api/solana/whales");
  },

  radar(): Promise<SolanaEnvelope<SolanaRadarSignal[]>> {
    return getJson<SolanaRadarSignal[]>("/api/solana/radar");
  },

  walletBalances(address: string): Promise<SolanaEnvelope<SolanaWalletBalances>> {
    return getJson<SolanaWalletBalances>(
      `/api/solana/wallet/balances?address=${encodeURIComponent(address)}`,
    );
  },

  walletActivity(address: string): Promise<SolanaEnvelope<SolanaWalletActivity>> {
    return getJson<SolanaWalletActivity>(
      `/api/solana/wallet/activity?address=${encodeURIComponent(address)}`,
    );
  },
};

export type { LiveSolanaRow, SolanaEngineStatus, SolanaRadarSignal, SolanaWhaleEvent, SolanaWalletActivity, SolanaWalletBalances };