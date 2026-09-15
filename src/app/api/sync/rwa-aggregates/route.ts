import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { RWA_CATEGORY_SOURCES } from "@/server/sync/services/rwaAggregateService";
import { SYNC_CONFIG } from "@/server/sync/config";

export const dynamic = "force-dynamic";

/** Ordered category list for the UI grid (fixed RECODE taxonomy). */
const ORDER = Object.keys(RWA_CATEGORY_SOURCES);

export async function GET() {
  const engine = getMarketSyncEngine();
  engine.ensureStarted();
  const d = getSyncStore().get();
  const shape = d.rwaAggregates;
  const categories = ORDER.map((name) => {
    const agg = shape?.categories[name];
    return (
      agg ?? {
        category: name,
        marketCap: null,
        volume24h: null,
        change24hPct: null,
        sparkline: null,
        assets: null,
        updatedAt: null,
        source: null,
      }
    );
  });
  const fresh = shape ? Date.now() - shape.updatedAt <= 2 * SYNC_CONFIG.rwaAggregatesMs : false;
  return NextResponse.json({
    status: shape && Object.keys(shape.categories).length > 0 ? "live" : "empty",
    fresh,
    // boolean only — the API key itself never leaves the server
    authenticated: engine.coingecko.keyConfigured,
    data: { updatedAt: shape?.updatedAt ?? null, sources: shape?.sources ?? [], categories },
  });
}
