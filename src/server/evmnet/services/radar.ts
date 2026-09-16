import type { EvmNetToken } from "../types";
import type { EvmNetWhaleEvent, EvmNetRadarSignal } from "../types";

/**
 * EVM NET — rule-based Radar over verified stored data.
 * Every signal carries its derivation basis; nothing is fabricated.
 */

export function computeEvmNetRadar(
  tokens: Record<string, EvmNetToken>,
  whales: EvmNetWhaleEvent[],
  whaleThresholdUsd: number,
): EvmNetRadarSignal[] {
  const signals: EvmNetRadarSignal[] = [];
  const now = Date.now();
  let n = 0;
  const id = (kind: string) => `evmnet-${kind}-${now}-${n++}`;

  for (const t of Object.values(tokens)) {
    if (t.volume24h != null && t.liquidity != null && t.liquidity > 0 && t.volume24h >= 3 * t.liquidity) {
      signals.push({
        id: id("unusual-volume"),
        kind: "unusual-volume",
        severity: t.volume24h >= 10 * t.liquidity ? "high" : "notable",
        token: t.address,
        symbol: t.symbol,
        message: `Unusual volume on ${t.symbol ?? t.address}: 24h volume ${(t.volume24h / 1000).toFixed(1)}K vs liquidity ${(t.liquidity / 1000).toFixed(1)}K`,
        basis: `Verified 24h volume $${t.volume24h.toLocaleString()} ÷ liquidity $${t.liquidity.toLocaleString()} = ${(t.volume24h / t.liquidity).toFixed(1)}×`,
        detectedAt: now,
      });
    }
    if (t.change24hPct != null && Math.abs(t.change24hPct) >= 15) {
      signals.push({
        id: id("price-movement"),
        kind: "price-movement",
        severity: Math.abs(t.change24hPct) >= 50 ? "high" : "notable",
        token: t.address,
        symbol: t.symbol,
        message: `${t.change24hPct > 0 ? "Pump" : "Dump"} signal on ${t.symbol ?? t.address}: 24h change ${t.change24hPct.toFixed(1)}%`,
        basis: `Verified 24h price change ${t.change24hPct.toFixed(2)}% (DexScreener)`,
        detectedAt: now,
      });
    }
    if (t.pairCreatedAt != null && now - t.pairCreatedAt <= 86_400_000) {
      signals.push({
        id: id("newly-active"),
        kind: "newly-active",
        severity: "info",
        token: t.address,
        symbol: t.symbol,
        message: `New pair: ${t.symbol ?? t.address} on ${t.dexId ?? "unknown DEX"}`,
        basis: `Pair created ${new Date(t.pairCreatedAt).toISOString()} (verified pair age)`,
        detectedAt: now,
      });
    }
  }

  const cutoff = now - 3_600_000;
  const recent = whales.filter((w) => w.observedAt >= cutoff);
  if (recent.length > 0) {
    const top = [...recent].sort((a, b) => b.usd - a.usd)[0];
    signals.push({
      id: id("whale-activity"),
      kind: "whale-activity",
      severity: top.usd >= whaleThresholdUsd * 5 ? "high" : "notable",
      token: null,
      symbol: top.symbol,
      message: `${recent.length} large ${top.symbol} transfer${recent.length === 1 ? "" : "s"} in the last hour — largest ${top.usd.toLocaleString()} ${top.symbol}`,
      basis: `${top.source}; tx ${top.txHash}`,
      detectedAt: now,
    });
  }

  return signals;
}