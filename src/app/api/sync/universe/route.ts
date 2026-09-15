import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";

export const dynamic = "force-dynamic";

/** Cross-chain RWA universe (CoinGecko discovery), cached by the engine. */
export async function GET() {
  getMarketSyncEngine().ensureStarted();
  const universe = getSyncStore().get().universe;
  if (!universe || universe.rows.length === 0) {
    return NextResponse.json({
      status: "unavailable",
      data: null,
      error: "RWA universe discovery has not returned data yet",
    });
  }
  const rows = [...universe.rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  return NextResponse.json({
    status: "live",
    data: rows,
    updatedAt: universe.updatedAt,
    fetchedCategories: universe.fetchedCategories,
  });
}