import { NextResponse } from "next/server";
import { getSyncStore } from "@/server/sync/store";
import { SYNC_CONFIG } from "@/server/sync/config";
import { computeIntelligence, thresholdsFromEnv } from "@/lib/intelligence";
import { spreadPct } from "@/lib/market-math";
import type { CandleTimeframe } from "@/server/sync/types";

export const dynamic = "force-dynamic";

/**
 * Asset Intelligence endpoint — deterministic scores computed SERVER-SIDE
 * from the verified store (candles, quotes, transfers). Every returned score
 * carries its `basis` (the exact formula inputs); metrics without enough
 * verified data are returned as null with a reason — never fabricated.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const addressParam = url.searchParams.get("address")?.trim().toLowerCase() ?? null;
  if (!symbol && !addressParam) {
    return NextResponse.json({ status: "empty", data: null, error: "symbol or address required" });
  }
  const d = getSyncStore().get();
  const market = addressParam
    ? d.markets[addressParam]
    : Object.values(d.markets).find((m) => (m.symbol ?? "").toUpperCase() === symbol);
  if (!market) {
    return NextResponse.json({ status: "empty", data: null, error: "symbol not indexed" });
  }
  const address = market.address;
  const price = d.prices[address];

  /* Scoring prefers the 1h candle series (intraday structure + enough
     periods for 24h/7d returns); falls back to 1d candles when only
     daily history exists. Source label travels with the response. */
  const pickCandles = (tf: CandleTimeframe) => {
    const entry = d.candles[`${address}:${tf}`];
    return entry && entry.candles.length > 0
      ? { tf, candles: entry.candles, source: entry.source ?? "engine" }
      : null;
  };
  const series = pickCandles("1h") ?? pickCandles("4h") ?? pickCandles("1d");
  const volume24h = price?.volume24h ?? null;
  const spread = spreadPct(price?.bid ?? null, price?.ask ?? null);

  const result = computeIntelligence(
    {
      candles: series?.candles ?? null,
      candleTimeframe: series?.tf,
      price: price?.price ?? null,
      volume24h,
      spreadPct: spread,
      change24hPct: price?.change24hPct ?? null,
    },
    thresholdsFromEnv(),
  );

  const hasAny =
    result.momentum != null ||
    result.liquidity != null ||
    result.volatility != null ||
    result.trend != null ||
    result.volumeActivity?.label != null;

  return NextResponse.json({
    status: hasAny ? "live" : "empty",
    data: hasAny
      ? {
          symbol: market.symbol,
          address,
          ...result,
          inputs: {
            candleTimeframe: series?.tf ?? null,
            candleSource: series?.source ?? null,
            candleCount: series?.candles.length ?? 0,
            volume24h,
            spreadPct: spread,
            change24hPct: price?.change24hPct ?? null,
          },
          thresholds: {
            // Threshold echoes keep the surface auditable (numbers only, no secrets).
            momentumWeights: thresholdsFromEnv().momentumWeights,
            freshnessMs: SYNC_CONFIG.priceFreshnessMs,
          },
          computedAt: Date.now(),
        }
      : null,
  });
}