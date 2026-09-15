import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { SYNC_CONFIG } from "@/server/sync/config";
import { RECODE_CONFIG } from "@/lib/recodeConfig";

export const dynamic = "force-dynamic";

/**
 * $RECODE token snapshot — served exclusively from the MarketSyncEngine
 * store (the same verified data that powers the app). No secondary price
 * system, no fabricated values. Only the five public landing metrics are
 * exposed here; holder/whale analytics remain inside the app surfaces.
 */
export async function GET() {
  getMarketSyncEngine().ensureStarted();
  const cfg = RECODE_CONFIG;

  if (!cfg.launched || !cfg.contractAddress) {
    return NextResponse.json({
      status: "unconfigured",
      data: null,
      message: "Token contract not yet configured",
    });
  }

  const addr = cfg.contractAddress.toLowerCase();
  const d = getSyncStore().get();
  const market = d.markets[addr];
  const price = d.prices[addr];
  const liquidity = d.liquidity[addr];

  if (!market) {
    return NextResponse.json({
      status: "unavailable",
      data: null,
      message: "Token not yet indexed — add the contract to the market registry",
    });
  }
  if (!price) {
    return NextResponse.json({
      status: "unavailable",
      data: null,
      message: "Awaiting verified price data",
    });
  }

  const fresh = Date.now() - price.updatedAt <= SYNC_CONFIG.priceFreshnessMs;
  return NextResponse.json({
    status: fresh ? "live" : "stale",
    data: {
      symbol: market.symbol ?? cfg.symbol,
      name: market.name ?? cfg.name,
      contract: addr,
      chainId: cfg.network.chainId,
      price: price.price,
      change24hPct: price.change24hPct,
      marketCap: price.marketCap,
      volume24h: price.volume24h,
      liquidity: liquidity?.total ?? null,
      updatedAt: price.updatedAt,
      source: price.source,
    },
  });
}
