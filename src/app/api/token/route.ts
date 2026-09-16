import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { SYNC_CONFIG } from "@/server/sync/config";
import { RECODE_CONFIG } from "@/lib/recodeConfig";
import {
  resolveRecodeToken,
  type RecodeResolvedMarket,
} from "@/server/sync/recodeTokenResolver";

export const dynamic = "force-dynamic";

/**
 * $RECODE token snapshot — the official contract address is the primary
 * lookup key. Resolution order:
 *   1. MarketSyncEngine store (verified engine data)
 *   2. Direct DexScreener lookup by contract address (exact base match)
 * No static tracked-token dependency, no secondary price system, no
 * fabricated values. Server-side cache (20s TTL + in-flight dedup) keeps
 * provider calls polite.
 */

type Snapshot = {
  symbol: string;
  name: string;
  contract: string | null;
  configured: boolean;
  chainId: number | null;
  chainName: string | null;
  explorerUrl: string | null;
  price: number | null;
  change24hPct: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
  pairsTotal: number | null;
  logoUrl: string | null;
  dexId: string | null;
  pairAddress: string | null;
  updatedAt: number;
  source: string;
};

/** 20s TTL + single in-flight promise (request deduplication). */
let cache: { at: number; payload: unknown } | null = null;
let inFlight: Promise<unknown> | null = null;
const TTL_MS = 20_000;

async function buildSnapshot(): Promise<{ status: string; data: Snapshot | null; message?: string }> {
  const cfg = RECODE_CONFIG;
  const configured = Boolean(cfg.launched && cfg.contractAddress);
  const base: Snapshot = {
    symbol: cfg.symbol,
    name: cfg.name,
    contract: configured ? (cfg.contractAddress as string).toLowerCase() : null,
    configured,
    chainId: cfg.network.chainId,
    chainName: cfg.network.name,
    explorerUrl: cfg.links.explorer,
    price: null,
    change24hPct: null,
    marketCap: null,
    volume24h: null,
    liquidity: null,
    pairsTotal: null,
    logoUrl: null,
    dexId: null,
    pairAddress: null,
    updatedAt: Date.now(),
    source: "config",
  };

  // A) Official address not configured.
  if (!configured) {
    return { status: "unconfigured", data: null, message: "Official RECODE contract not configured." };
  }
  const addr = (cfg.contractAddress as string).toLowerCase();
  base.contract = addr;

  // 1) MarketSyncEngine store (verified engine data, same as the app).
  const d = getSyncStore().get();
  const market = d.markets[addr];
  const price = d.prices[addr];
  if (market && price) {
    const liquidity = d.liquidity[addr];
    const fresh = Date.now() - price.updatedAt <= SYNC_CONFIG.priceFreshnessMs;
    return {
      status: fresh ? "live" : "stale",
      data: {
        ...base,
        symbol: market.symbol ?? base.symbol,
        name: market.name ?? base.name,
        price: price.price,
        change24hPct: price.change24hPct,
        marketCap: price.marketCap,
        volume24h: price.volume24h,
        liquidity: liquidity?.total ?? null,
        logoUrl: null,
        updatedAt: price.updatedAt,
        source: price.source,
      },
    };
  }

  // 2) Direct contract-address resolution (DexScreener, exact base match).
  const resolved = await resolveRecodeToken(addr);
  if (resolved === "provider-unavailable") {
    // D) Provider temporarily unavailable.
    return {
      status: "unavailable",
      data: null,
      message: "Live market provider temporarily unavailable.",
    };
  }
  if (resolved == null) {
    // B) Address configured; no verified market found by any provider.
    return {
      status: "unavailable",
      data: null,
      message: "Token found on-chain, but market indexing is not available yet.",
    };
  }
  const snap = resolved as RecodeResolvedMarket;
  // token.chain is the source of truth. If the deployment chain is not
  // in the RECODE registry the raw DexScreener chain is reported — the
  // configured chain is NEVER used as a fallback for foreign metrics.
  const chainLabel = snap.chainId != null ? null : `unmapped (dexscreener: ${snap.dexscreenerChain})`;
  return {
    status: snap.priceUsd != null ? "live" : "unavailable",
    data: {
      ...base,
      chainId: snap.chainId,
      chainName: snap.chainId != null ? base.chainName : `DexScreener chain: ${snap.dexscreenerChain}`,
      price: snap.priceUsd,
      change24hPct: snap.change24hPct,
      marketCap: snap.marketCap ?? snap.fdv,
      volume24h: snap.volume24h,
      liquidity: snap.liquidityUsd,
      pairsTotal: snap.pairsTotal,
      logoUrl: snap.logoUrl,
      dexId: snap.dexId,
      pairAddress: snap.pairAddress,
      symbol: snap.symbol ?? base.symbol,
      name: snap.name ?? base.name,
      source: `DexScreener direct lookup (${snap.dexscreenerChain}, ${snap.pairsTotal} exact pair${snap.pairsTotal === 1 ? "" : "s"})${chainLabel ? ` — ${chainLabel}` : ""}`,
    },
  };
}

export async function GET() {
  getMarketSyncEngine().ensureStarted();
  if (cache && Date.now() - cache.at <= TTL_MS) {
    return NextResponse.json(cache.payload);
  }
  if (!inFlight) {
    inFlight = buildSnapshot().finally(() => {
      inFlight = null;
    });
  }
  const payload = await inFlight;
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
