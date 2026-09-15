import type { SolanaConfig } from "../configTypes";
import type { SolanaRadarSignal } from "../types";
import type { SolanaStoreShape } from "../store";

/**
 * ============================================================
 * SOLANA — RECODE Radar signal computation (rule-based)
 * ============================================================
 * Every signal is derived from verified stored data (DEX market
 * history, whale deltas) with its exact basis attached. Fields a
 * provider does not expose are skipped — never inferred, never
 * fabricated, never "0".
 */

const MIN_VOLUME_USD_FOR_SPIKE = 25_000;
const MIN_LIQUIDITY_USD_FOR_CHANGE = 10_000;

export function computeRadarSignals(
  d: SolanaStoreShape,
  config: SolanaConfig,
  now: number = Date.now(),
): SolanaRadarSignal[] {
  const signals: SolanaRadarSignal[] = [];
  const whalesByMint = new Map<string, number>();
  for (const w of d.whales) {
    if (now - w.observedAt <= 6 * 3_600_000) {
      whalesByMint.set(w.mint, (whalesByMint.get(w.mint) ?? 0) + 1);
    }
  }

  for (const token of Object.values(d.tokens)) {
    const sym = token.symbol ?? token.mint.slice(0, 6);

    /* Unusual volume: latest 24h volume ≥ 2× the token's own stored average. */
    const vh = d.volumeHistory[token.mint] ?? [];
    if (token.volume24hUsd != null && vh.length >= 5) {
      const avg = vh.slice(0, -1).reduce((a, p) => a + p.v, 0) / (vh.length - 1);
      if (avg > 0 && token.volume24hUsd >= MIN_VOLUME_USD_FOR_SPIKE) {
        const ratio = token.volume24hUsd / avg;
        if (ratio >= 2) {
          signals.push({
            id: `unusual-volume:${token.mint}:${Math.floor(now / 3_600_000)}`,
            kind: "unusual-volume",
            label: `Unusual volume on ${sym}`,
            mint: token.mint,
            symbol: token.symbol,
            basis: `24h volume $${Math.round(token.volume24hUsd).toLocaleString("en")} is ${ratio.toFixed(1)}× the tracked average ($${Math.round(avg).toLocaleString("en")})`,
            severity: ratio >= 4 ? "high" : "notable",
            detectedAt: now,
          });
        }
      }
    }

    /* Liquidity change: ≥ ±20% vs the last stored liquidity point ≥ 30 min old. */
    const lh = d.liquidityHistory[token.mint] ?? [];
    if (token.liquidityUsd != null && lh.length >= 2) {
      const reference = [...lh].reverse().find((p) => now - p.t >= 30 * 60_000);
      if (reference && reference.v > 0 && token.liquidityUsd >= MIN_LIQUIDITY_USD_FOR_CHANGE) {
        const change = ((token.liquidityUsd - reference.v) / reference.v) * 100;
        if (Math.abs(change) >= 20) {
          signals.push({
            id: `liquidity-change:${token.mint}:${Math.floor(now / 3_600_000)}`,
            kind: "liquidity-change",
            label: `${change > 0 ? "Liquidity inflow" : "Liquidity exit"} on ${sym}`,
            mint: token.mint,
            symbol: token.symbol,
            basis: `Liquidity $${Math.round(token.liquidityUsd).toLocaleString("en")} is ${Math.abs(change).toFixed(1)}% ${change > 0 ? "above" : "below"} the $${Math.round(reference.v).toLocaleString("en")} reference`,
            severity: Math.abs(change) >= 50 ? "high" : "notable",
            detectedAt: now,
          });
        }
      }
    }

    /* Significant price movement (provider-verified 24h change). */
    if (token.change24hPct != null && Math.abs(token.change24hPct) >= 10) {
      signals.push({
        id: `price-movement:${token.mint}:${Math.floor(now / 3_600_000)}`,
        kind: "price-movement",
        label: `${token.change24hPct > 0 ? "Pump" : "Dump"} signal on ${sym}`,
        mint: token.mint,
        symbol: token.symbol,
        basis: `Verified 24h price change ${token.change24hPct.toFixed(2)}% (price $${token.priceUsd ?? "unavailable"})`,
        severity: Math.abs(token.change24hPct) >= 25 ? "high" : "notable",
        detectedAt: now,
      });
    }

    /* Whale activity: recent balance-delta events on this mint. */
    const whaleCount = whalesByMint.get(token.mint) ?? 0;
    if (whaleCount > 0) {
      signals.push({
        id: `whale-activity:${token.mint}:${Math.floor(now / 3_600_000)}`,
        kind: "whale-activity",
        label: `Whale activity on ${sym}`,
        mint: token.mint,
        symbol: token.symbol,
        basis: `${whaleCount} large balance movement${whaleCount > 1 ? "s" : ""} ≥ $${config.whaleThresholdUsd.toLocaleString("en")} in the last 6h (largest-account deltas, Solana RPC)`,
        severity: whaleCount >= 3 ? "high" : "notable",
        detectedAt: now,
      });
    }

    /* Newly active: pair created within 7 days. */
    if (token.pairCreatedAt != null && now - token.pairCreatedAt <= 7 * 24 * 3_600_000) {
      signals.push({
        id: `newly-active:${token.mint}:${Math.floor(now / 86_400_000)}`,
        kind: "newly-active",
        label: `New pair trading ${sym}`,
        mint: token.mint,
        symbol: token.symbol,
        basis: `DEX pair ${token.dexId ?? "unknown"} created ${new Date(token.pairCreatedAt).toISOString().slice(0, 10)}`,
        severity: "info",
        detectedAt: now,
      });
    }
  }

  return signals;
}
