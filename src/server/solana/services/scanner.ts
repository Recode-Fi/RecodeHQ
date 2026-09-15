import { SOLANA_CONFIG } from "../config";
import type { SolanaStoreShape } from "../store";

/**
 * ============================================================
 * SOLANA — Market Scanner service
 * ============================================================
 * Enriches the verified token store into scanner rows with
 * calculated (never estimated) derivatives:
 *   • buy/sell ratio — computed from verified 24h buy/sell txn counts
 *   • liquidity / volume Δ — current verified value vs the last
 *     stored observation ≥ 24h old (engine's own measurement history)
 *   • whale activity — count of verified balance-delta events (24h)
 *   • smart-money activity — distinct wallets with verified
 *     accumulation events ≥ threshold in the last 24h
 * Every unavailable input propagates as null → "—" in the UI.
 */

export interface SolanaScanRow {
  chain: "solana";
  mint: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  /** Current liquidity vs the last stored observation ≥ 24h old (%). */
  liquidityChange24hPct: number | null;
  volume24h: number | null;
  /** Current 24h volume vs the last stored observation ≥ 24h old (%). */
  volumeChange24hPct: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  /** CALCULATED: buys / sells over the last 24h (null when sells is 0 or unknown). */
  buySellRatio: number | null;
  txns24h: number | null;
  dexId: string | null;
  pairAddress: string | null;
  /** Pair age in ms (null when the provider has no creation timestamp). */
  pairAgeMs: number | null;
  supply: number | null;
  /** Verified whale events on this mint in the last 24h. */
  whaleEvents24h: number;
  /** Distinct wallets with verified accumulation ≥ threshold in the last 24h. */
  smartWallets24h: number;
  /** 24h price sparkline from verified stored price points. */
  sparkline: number[];
  dataStatus: "live" | "stale" | "unavailable";
  updatedAt: number | null;
  sources: string[];
}

/** Percentage change vs the newest stored point that is at least `windowMs` old. */
export function changeVsReference(
  history: { t: number; v: number }[],
  current: number | null,
  windowMs: number,
  now: number,
): number | null {
  if (current == null) return null;
  let reference: number | null = null;
  for (const p of history) {
    if (now - p.t >= windowMs) reference = p.v; // newest qualifying point wins
  }
  if (reference == null || reference <= 0) return null;
  return ((current - reference) / reference) * 100;
}

export function buildScannerRows(
  d: SolanaStoreShape,
  now: number = Date.now(),
  whaleWindowMs = 24 * 3_600_000,
): SolanaScanRow[] {
  // Whale/smart-money tallies per mint from verified events.
  const whaleCount = new Map<string, number>();
  const smartWallets = new Map<string, Set<string>>();
  for (const w of d.whales) {
    if (now - w.observedAt > whaleWindowMs) continue;
    whaleCount.set(w.mint, (whaleCount.get(w.mint) ?? 0) + 1);
    if (w.kind === "accumulation" && w.usd != null && Math.abs(w.usd) >= SOLANA_CONFIG.whaleThresholdUsd) {
      const set = smartWallets.get(w.mint) ?? new Set<string>();
      set.add(w.wallet);
      smartWallets.set(w.mint, set);
    }
  }

  const rows: SolanaScanRow[] = [];
  for (const t of Object.values(d.tokens)) {
    const quoted = t.updatedAt > 0;
    const age = quoted ? now - t.updatedAt : null;
    const buys = t.buys24h;
    const sells = t.sells24h;
    // Ratio is only meaningful with verified counts on both sides and at
    // least one sell — a 100% buy ratio would read like a fabricated 0.
    const buySellRatio = buys != null && sells != null && sells > 0 ? buys / sells : null;
    const liquidityChange24hPct = changeVsReference(
      d.liquidityHistory[t.mint] ?? [],
      t.liquidityUsd,
      24 * 3_600_000,
      now,
    );
    const volumeChange24hPct = changeVsReference(
      d.volumeHistory[t.mint] ?? [],
      t.volume24hUsd,
      24 * 3_600_000,
      now,
    );
    const spark = (d.priceHistory[t.mint] ?? [])
      .filter((p) => now - p.t <= 24 * 3_600_000)
      .map((p) => p.p);
    rows.push({
      chain: "solana",
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      logoUrl: t.logoUrl,
      price: t.priceUsd,
      marketCap: t.marketCap,
      fdv: t.fdv,
      liquidity: t.liquidityUsd,
      liquidityChange24hPct,
      volume24h: t.volume24hUsd,
      volumeChange24hPct,
      change24hPct: t.change24hPct,
      buys24h: buys,
      sells24h: sells,
      buySellRatio,
      txns24h: t.txns24h,
      dexId: t.dexId,
      pairAddress: t.pairAddress,
      pairAgeMs: t.pairCreatedAt != null ? now - t.pairCreatedAt : null,
      supply: t.supply,
      whaleEvents24h: whaleCount.get(t.mint) ?? 0,
      smartWallets24h: smartWallets.get(t.mint)?.size ?? 0,
      sparkline: spark.slice(-72),
      dataStatus: !quoted
        ? "unavailable"
        : age != null && age <= SOLANA_CONFIG.priceFreshnessMs
          ? "live"
          : "stale",
      updatedAt: quoted ? t.updatedAt : null,
      sources: t.sources,
    });
  }
  return rows;
}

export interface SolanaSmartMoneyWallet {
  chain: "solana";
  wallet: string;
  /** Net verified flow: accumulation − distribution (transfers excluded). */
  netUsd: number | null;
  accumulations: number;
  distributions: number;
  transfers: number;
  assets: string[];
  lastActive: number;
}

/**
 * Server-side smart-money ranking over verified whale events (mirrors the
 * EVM Smart Money semantics: net measured flow, no opaque labels, ROI/win-
 * rate unavailable rather than estimated). Transfers are direction-neutral
 * and excluded from the net; they are counted for context only.
 */
export function smartMoneyRankings(
  d: SolanaStoreShape,
  now: number = Date.now(),
  windowMs = 24 * 3_600_000,
  limit = 20,
): SolanaSmartMoneyWallet[] {
  const byWallet = new Map<
    string,
    {
      net: number;
      hasFlow: boolean;
      acc: number;
      dist: number;
      transfers: number;
      assets: Set<string>;
      last: number;
    }
  >();
  for (const w of d.whales) {
    if (now - w.observedAt > windowMs) continue;
    const e =
      byWallet.get(w.wallet) ??
      {
        net: 0,
        hasFlow: false,
        acc: 0,
        dist: 0,
        transfers: 0,
        assets: new Set<string>(),
        last: 0,
      };
    if (w.kind === "accumulation" || w.kind === "distribution") {
      if (w.usd != null) {
        e.net += w.kind === "accumulation" ? Math.abs(w.usd) : -Math.abs(w.usd);
        e.hasFlow = true;
      }
      if (w.kind === "accumulation") e.acc += 1;
      else e.dist += 1;
    } else if (w.kind === "transfer") {
      e.transfers += 1;
    }
    if (w.symbol) e.assets.add(w.symbol);
    e.last = Math.max(e.last, w.observedAt);
    byWallet.set(w.wallet, e);
  }
  return [...byWallet.entries()]
    .map(([wallet, e]) => ({
      chain: "solana" as const,
      wallet,
      netUsd: e.hasFlow ? e.net : null,
      accumulations: e.acc,
      distributions: e.dist,
      transfers: e.transfers,
      assets: [...e.assets],
      lastActive: e.last,
    }))
    .sort((a, b) => (b.netUsd ?? -Infinity) - (a.netUsd ?? -Infinity))
    .slice(0, limit);
}