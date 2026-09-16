import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcStore } from "@/server/arc/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const store = getArcStore().get();
  const rows = Object.values(store.tokens)
    .sort((a, b) => (b.volume24h ?? b.liquidity ?? 0) - (a.volume24h ?? a.liquidity ?? 0))
    .map((t) => ({
      chain: "arc" as const,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoUrl: t.logoUrl,
      priceUsd: t.priceUsd,
      marketCap: t.marketCap,
      fdv: t.fdv,
      liquidity: t.liquidity,
      volume24h: t.volume24h,
      change24hPct: t.change24hPct,
      buys24h: t.buys24h,
      sells24h: t.sells24h,
      txns24h: t.txns24h,
      dexId: t.dexId,
      pairAddress: t.pairAddress,
      quoteToken: t.quoteToken,
      isNew: t.pairCreatedAt != null && Date.now() - t.pairCreatedAt <= 86_400_000,
      pairAgeMs: t.pairCreatedAt != null ? Date.now() - t.pairCreatedAt : null,
      dataStatus: t.updatedAt != null && Date.now() - t.updatedAt < 600_000 ? "live" : "stale",
      updatedAt: t.updatedAt,
      sources: t.sources,
    }));
  return NextResponse.json({ status: "live", data: rows });
}