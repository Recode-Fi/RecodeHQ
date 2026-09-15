import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { computeLiveOverview } from "@/server/sync/analyticsService";
import { SYNC_CONFIG } from "@/server/sync/config";
import { getSyncStore } from "@/server/sync/store";

export const dynamic = "force-dynamic";

export async function GET() {
  getMarketSyncEngine().ensureStarted();
  const overview = computeLiveOverview(getSyncStore());
  return NextResponse.json({
    status: overview.marketsIndexed > 0 ? "live" : "empty",
    data: { ...overview, liquidityConfigured: Boolean(SYNC_CONFIG.indexerUrl) },
  });
}