import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { SYNC_CONFIG } from "@/server/sync/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const d = getSyncStore().get();
  const market = Object.values(d.markets).find(
    (m) => (m.symbol ?? "").toUpperCase() === symbol,
  );
  if (!market) {
    return NextResponse.json({
      status: "empty",
      data: null,
      history: [],
      error: symbol ? `No indexed market for "${symbol}"` : "symbol required",
    });
  }
  const data = d.holders[market.address] ?? null;
  const history = d.holderHistory[market.address] ?? [];
  // Honest degraded-state message when holder providers are not producing.
  const providers = {
    primary: SYNC_CONFIG.goldskySubgraphUrl ? "goldsky-subgraph" : SYNC_CONFIG.indexerUrl ? "indexer" : "not-configured",
    fallback: "blockscout",
  };
  return NextResponse.json({
    status: data ? "live" : "empty",
    data,
    history,
    error: data
      ? undefined
      : "Holder data unavailable — no holder provider is currently reachable or configured.",
    providers,
  });
}