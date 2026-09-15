import { SOLANA_CONFIG } from "../config";
import type { SolanaStoreShape } from "../store";
import type { LiveSolanaRow, SolanaHolders, SolanaToken, SolanaWhaleEvent } from "../types";

/**
 * ============================================================
 * SOLANA — UI row builder (screener / asset surfaces)
 * ============================================================
 * Maps the store's verified token state into UI rows with honest
 * data-status semantics: fresh quotes are "live", older stored
 * quotes "stale", never-quoted mints "unavailable". Missing
 * provider fields stay null — the UI renders "—"/"Data
 * unavailable", never 0.
 */

/** Top-N holders aggregate used by whale/asset intelligence. */
export function holderConcentration(
  holders: SolanaHolders | null | undefined,
  n: number,
): { value: number | null; coverage: number } {
  if (!holders || holders.top.length === 0) return { value: null, coverage: 0 };
  const withShare = holders.top.filter((h) => h.sharePct != null);
  if (withShare.length === 0) return { value: null, coverage: 0 };
  const value = withShare
    .slice(0, n)
    .reduce((a, h) => a + (h.sharePct as number), 0);
  return { value, coverage: withShare.length };
}

export function toRows(d: SolanaStoreShape, now: number = Date.now()): LiveSolanaRow[] {
  const rows: LiveSolanaRow[] = [];
  for (const token of Object.values(d.tokens)) {
    const quoted = token.updatedAt > 0;
    const age = quoted ? now - token.updatedAt : null;
    const dataStatus: LiveSolanaRow["dataStatus"] = !quoted
      ? "unavailable"
      : age != null && age <= SOLANA_CONFIG.priceFreshnessMs
        ? "live"
        : "stale";
    // 24h sparkline from verified stored price points.
    const spark = (d.priceHistory[token.mint] ?? [])
      .filter((p) => now - p.t <= 24 * 3_600_000)
      .map((p) => p.p);
    rows.push({
      chain: "solana",
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      logoUrl: token.logoUrl,
      price: token.priceUsd,
      marketCap: token.marketCap,
      fdv: token.fdv,
      liquidity: token.liquidityUsd,
      volume24h: token.volume24hUsd,
      change24hPct: token.change24hPct,
      buys24h: token.buys24h,
      sells24h: token.sells24h,
      txns24h: token.txns24h,
      dexId: token.dexId,
      pairAddress: token.pairAddress,
      pairCreatedAt: token.pairCreatedAt,
      supply: token.supply,
      sparkline: spark.slice(-72),
      dataStatus,
      updatedAt: quoted ? token.updatedAt : null,
      isNew: quoted && now - token.firstSeen <= 24 * 3_600_000,
      sources: token.sources,
    });
  }
  return rows;
}

export function toWhaleFeed(d: SolanaStoreShape, limit = 100): SolanaWhaleEvent[] {
  return [...d.whales]
    .sort((a, b) => b.observedAt - a.observedAt)
    .slice(0, limit);
}

export function tokenDetail(
  d: SolanaStoreShape,
  mint: string,
  now: number = Date.now(),
): {
  token: SolanaToken;
  holders: SolanaHolders | null;
  whales: SolanaWhaleEvent[];
  sparkline: number[];
  dataStatus: "live" | "stale" | "unavailable";
} | null {
  const token = d.tokens[mint];
  if (!token) return null;
  const quoted = token.updatedAt > 0;
  const age = quoted ? now - token.updatedAt : null;
  const spark = (d.priceHistory[mint] ?? [])
    .filter((p) => now - p.t <= 24 * 3_600_000)
    .map((p) => p.p);
  return {
    token,
    holders: d.holders[mint] ?? null,
    whales: d.whales.filter((w) => w.mint === mint).slice(0, 25),
    sparkline: spark.slice(-72),
    dataStatus: !quoted
      ? "unavailable"
      : age != null && age <= SOLANA_CONFIG.priceFreshnessMs
        ? "live"
        : "stale",
  };
}