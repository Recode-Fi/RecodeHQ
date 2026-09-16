import { NextResponse } from "next/server";
import { getEvmNetEngine, parseEvmNetChain } from "@/server/evmnet/registry";
import { getEvmNetStore } from "@/server/evmnet/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const key = parseEvmNetChain(chain);
  if (!key) {
    return NextResponse.json({ status: "error", data: null, error: "Unknown EVM net chain" }, { status: 404 });
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  const store = getEvmNetStore(key).get();
  // Cold-instance warm-up: a fresh serverless instance has an empty
  // store until the first background cycle — run one bounded pass so
  // the first user visit gets real rows instead of an empty state.
  if (Object.keys(store.tokens).length === 0) {
    await Promise.race([
      engine.warmUp(),
      new Promise((resolve) => setTimeout(resolve, 12_000)),
    ]);
  }
  const fresh = getEvmNetStore(key).get();
  const rows = Object.values(fresh.tokens)
    .sort((a, b) => (b.volume24h ?? b.liquidity ?? 0) - (a.volume24h ?? a.liquidity ?? 0))
    .map((t) => ({
      chain: key,
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
      dataStatus: t.updatedAt != null && Date.now() - t.updatedAt < 900_000 ? "live" : "stale",
      updatedAt: t.updatedAt,
      sources: t.sources,
    }));
  return NextResponse.json({ status: "live", data: rows });
}