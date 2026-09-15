import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { aggregateCandles } from "@/server/sync/services/candleAggregator";
import type { CandleTimeframe } from "@/server/sync/types";

export const dynamic = "force-dynamic";

const TFS: readonly string[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

export async function GET(request: Request) {
  const engine = getMarketSyncEngine();
  engine.ensureStarted();
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const tfParam = url.searchParams.get("tf") ?? "1d";
  const tf = (TFS.includes(tfParam) ? tfParam : "1d") as CandleTimeframe;
  if (!symbol) {
    return NextResponse.json({ status: "empty", data: [] });
  }
  engine.markHotPair(symbol, tf);
  const d = getSyncStore().get();
  const market = Object.values(d.markets).find(
    (m) => (m.symbol ?? "").toUpperCase() === symbol || m.address.toLowerCase() === symbol.toLowerCase(),
  );
  const key = market ? `${market.address}:${tf}` : null;
  const entry = key ? d.candles[key] : null;
  let candles = entry?.candles ?? [];
  // Fallback: no external feed data → aggregate real observed ticks
  // (live Robinhood/explorer prices recorded by the sync engine) into
  // verified OHLCV buckets. Never synthesized; empty when <2 real ticks.
  if (candles.length < 2 && market) {
    candles = aggregateCandles(getSyncStore(), market.address, tf);
  }
  return NextResponse.json({
    status: candles.length > 0 ? "live" : "empty",
    source: candles.length > 0 ? entry?.source ?? "observed-ticks" : null,
    data: candles,
  });
}
