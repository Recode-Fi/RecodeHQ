import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const d = getSyncStore().get();
  const market = Object.values(d.markets).find(
    (m) => (m.symbol ?? "").toUpperCase() === symbol,
  );
  const data = market ? d.holders[market.address] ?? null : null;
  const history = market ? d.holderHistory[market.address] ?? [] : [];
  return NextResponse.json({ status: data ? "live" : "empty", data, history });
}