import type { ArcToken } from "../store";
import type { ArcWhaleEvent, ArcRadarSignal } from "../store";

/**
 * ============================================================
 * ARC — rule-based Radar over verified stored data
 * ============================================================
 * Every signal carries its derivation basis. No fabrication:
 * signals are only computed from fields that actually exist.
 */

export function computeArcRadar(
  tokens: Record<string, ArcToken>,
  whales: ArcWhaleEvent[],
  whaleThresholdUsd: number,
): ArcRadarSignal[] {
  const signals: ArcRadarSignal[] = [];
  const now = Date.now();
  let n = 0;
  const id = (kind: string) => `arc-${kind}-${now}-${n++}`;

  for (const t of Object.values(tokens)) {
    // Unusual volume: 24h volume ≥ 3× liquidity (verified fields only).
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
    // Significant price movement.
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
    // New pair (≤ 24h old).
    if (t.pairCreatedAt != null && now - t.pairCreatedAt <= 86_400_000) {
      signals.push({
        id: id("newly-active"),
        kind: "newly-active",
        severity: "info",
        token: t.address,
        symbol: t.symbol,
        message: `New Arc pair: ${t.symbol ?? t.address} on ${t.dexId ?? "unknown DEX"}`,
        basis: `Pair created ${new Date(t.pairCreatedAt).toISOString()} (verified pair age)`,
        detectedAt: now,
      });
    }
  }

  // Whale activity: recent large USDC transfers (each backed by a tx hash).
  const cutoff = now - 3_600_000;
  const recent = whales.filter((w) => w.observedAt >= cutoff);
  if (recent.length > 0) {
    const top = [...recent].sort((a, b) => b.usd - a.usd)[0];
    signals.push({
      id: id("whale-activity"),
      kind: "whale-activity",
      severity: top.usd >= whaleThresholdUsd * 5 ? "high" : "notable",
      token: null,
      symbol: "USDC",
      message: `${recent.length} large USDC transfer${recent.length === 1 ? "" : "s"} on Arc in the last hour — largest ${top.usd.toLocaleString()} USDC`,
      basis: `${top.source}; tx ${top.txHash}`,
      detectedAt: now,
    });
    signals.push({
      id: id("large-transfer"),
      kind: "large-transfer",
      severity: "info",
      token: null,
      symbol: "USDC",
      message: `Large transfer: ${top.usd.toLocaleString()} USDC (${top.kind})`,
      basis: `tx ${top.txHash} block ${top.blockNumber} — system-emitter Transfer log`,
      detectedAt: now,
    });
  }

  return signals;
}