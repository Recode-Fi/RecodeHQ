import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { SYNC_CONFIG } from "@/server/sync/config";
import { getSyncStore } from "@/server/sync/store";
import { resolveSector } from "@/lib/classification";
import { spreadPct } from "@/lib/market-math";
import { tradingStatusOf } from "@/lib/tradingSession";
import { resolveSupply, fdvOf, marketCapFromCirculating } from "@/server/sync/intelligence/supply";
import type { SupplyCandidate } from "@/server/sync/intelligence/supply";
import type { SyncMarket, SyncPrice } from "@/server/sync/types";

export const dynamic = "force-dynamic";

const TF_WINDOWS: Record<string, number> = {
  "1H": 3_600_000,
  "24H": 86_400_000,
  "7D": 7 * 86_400_000,
  "30D": 30 * 86_400_000,
  ALL: Number.MAX_SAFE_INTEGER,
};

/**
 * Liquidity has exactly one wired source today (the on-chain
 * indexer/pool provider). When it isn't configured, liquidity is
 * structurally unavailable rather than "still syncing" — the UI must
 * never shimmer forever for a metric with no data source at all.
 */
const LIQUIDITY_CONFIGURED = Boolean(SYNC_CONFIG.indexerUrl);

/**
 * Verified supply candidates for one market, in the documented
 * hierarchy. The verified circulating market cap (admin-verified
 * explorer registry) travels with every candidate so circulating
 * supply can be derived where it is genuinely verified.
 */
function supplyCandidates(market: SyncMarket, price: SyncPrice | null): SupplyCandidate[] {
  const kind =
    market.source === "registry" && market.verified === true
      ? "official-registry"
      : market.source === "rpc"
        ? "contract-metadata"
        : market.source === "indexer"
          ? "chain-indexer"
          : "chain-indexer";
  const source =
    kind === "official-registry"
      ? "robinhood-explorer-registry"
      : market.source === "rpc"
        ? "rpc-contract-metadata"
        : `store:${market.source}`;
  const candidates: SupplyCandidate[] = [
    {
      kind,
      source,
      totalSupplyRaw: market.totalSupply,
      decimals: market.decimals,
      // Verified circulating market cap — enables derived circulating supply.
      circulatingMarketCap: price?.marketCap ?? null,
      updatedAt: market.lastSynced ?? market.firstSeen,
    },
  ];
  if (market.circulatingSupply != null) {
    try {
      const circ = Number(BigInt(market.circulatingSupply)) / 10 ** (market.decimals ?? 18);
      if (Number.isFinite(circ) && circ > 0) {
        candidates.push({
          kind: "external-registry",
          source: "indexer-circulating-supply",
          circulatingSupply: circ,
          updatedAt: market.lastSynced ?? market.firstSeen,
        });
      }
    } catch {
      /* malformed circulating supply string — skip, never guess */
    }
  }
  return candidates;
}

export async function GET(request: Request) {
  const engine = getMarketSyncEngine();
  engine.ensureStarted();
  const url = new URL(request.url);
  const tf = url.searchParams.get("tf") ?? "24H";
  const windowMs = TF_WINDOWS[tf] ?? TF_WINDOWS["24H"];
  const d = getSyncStore().get();
  const now = Date.now();
  const dayStart = now - 86_400_000;
  const rows = Object.values(d.markets).map((m) => {
    const price = d.prices[m.address];
    const logo = d.logos[m.address];
    const dataStatus = !price
      ? "unavailable"
      : now - price.updatedAt <= SYNC_CONFIG.priceFreshnessMs
        ? "live"
        : "stale";
    // sparkline: real observed prices within the selected timeframe window
    const sparkline = (d.priceHistory[m.address] ?? [])
      .filter((p) => now - p.t <= windowMs)
      .map((p) => p.price)
      .slice(-60);
    const txVolume = d.transactions
      .filter((t) => t.address === m.address && t.ts >= dayStart && t.usd != null)
      .reduce((acc, t) => acc + (t.usd as number), 0);
    const volume24h = price?.volume24h ?? (txVolume > 0 ? txVolume : null);
    // real buy/sell split from verified on-chain transfers (24h window)
    const dayTxs = d.transactions.filter(
      (t) => t.address === m.address && t.ts >= dayStart,
    );
    const buys24h = dayTxs.filter((t) => t.action === "buy").length;
    const sells24h = dayTxs.filter((t) => t.action === "sell").length;
    const buyVolume24h = price?.buyVolume24h
      ?? dayTxs.filter((t) => t.action === "buy" && t.usd != null).reduce((a, t) => a + (t.usd as number), 0);
    const sellVolume24h = price?.sellVolume24h
      ?? dayTxs.filter((t) => t.action === "sell" && t.usd != null).reduce((a, t) => a + (t.usd as number), 0);
    const hasFlowData = buys24h + sells24h > 0;
    // Verified supply hierarchy + FDV + market-cap semantics:
    //   marketCap = verified circulating mcap, or price × VERIFIED circulating supply
    //   FDV       = price × VERIFIED total supply (shown separately, never as mcap)
    const supply = resolveSupply(supplyCandidates(m, price), price?.price ?? null, now);
    const stockMcap = price?.marketCap ?? marketCapFromCirculating(price?.price ?? null, supply.circulatingSupply);
    const stockFdv = fdvOf(price?.price ?? null, supply.totalSupply);
    // Live quote derivation: mid already stored in price; spread + trading
    // status derived here from verified bid/ask + official capabilities.
    const quoteSpreadPct = spreadPct(price?.bid ?? null, price?.ask ?? null);
    const tradingStatus = price
      ? tradingStatusOf({
          halted: price.halted,
          capabilities: m.tradingCapabilities ?? null,
          now,
        })
      : null;
    const row = {
      address: m.address,
      symbol: m.symbol,
      name: m.name,
      assetType: m.assetType,
      tokenStandard: m.tokenStandard,
      stockTokenMarketCap: stockMcap,
      underlyingMarketCap: d.underlyingMcaps[m.address]?.marketCap ?? null,
      underlyingSymbol: m.underlyingSymbol ?? m.symbol,
      underlyingAssetType: m.underlyingAssetType ?? null,
      underlying: m.underlying,
      chainId: m.chainId,
      // resolved reachable logo first; un-probed assets fall back to metadata
      logoUrl: logo ? logo.url : m.logoUrl ?? null,
      verified: m.verified,
      firstSeen: m.firstSeen,
      source: m.source,
      fdv: stockFdv,
      marketCap: stockMcap,
      supply: {
        total: supply.totalSupply,
        circulating: supply.circulatingSupply,
        source: supply.source,
        verified: supply.verified,
        confidence: supply.confidence,
        circulatingBasis: supply.circulatingBasis,
        updatedAt: supply.updatedAt,
      },
      price: price?.price ?? null,
      bid: price?.bid ?? null,
      ask: price?.ask ?? null,
      spreadPct: quoteSpreadPct,
      halted: price?.halted ?? null,
      tradingStatus,
      tradingCapabilities: m.tradingCapabilities ?? null,
      high24h: price?.high ?? null,
      low24h: price?.low ?? null,
      change24hPct: price?.change24hPct ?? null,
      volume24h,
      buys24h: hasFlowData ? buys24h : null,
      sells24h: hasFlowData ? sells24h : null,
      buyVolume24h: hasFlowData && buyVolume24h > 0 ? buyVolume24h : null,
      sellVolume24h: hasFlowData && sellVolume24h > 0 ? sellVolume24h : null,
      liquidity: d.liquidity[m.address]?.total ?? null,
      liquidityConfigured: LIQUIDITY_CONFIGURED,
      holders: d.holders[m.address]?.total ?? null,
      updatedAt: price?.updatedAt ?? null,
      dataStatus,
      sparkline,
      dataSources: {
        price: price ? price.source : null,
        marketCap: price?.marketCap != null ? "Robinhood Chain explorer" : null,
        volume24h:
          price?.volume24h != null ? price.source : txVolume > 0 ? "Verified token transfers" : null,
        holders: d.holders[m.address] ? "Robinhood Chain explorer" : null,
        liquidity: d.liquidity[m.address]?.total != null ? "On-chain indexer" : null,
        change24h: null as string | null,
      },
      isNew: now - m.firstSeen < 86_400_000,
    };
    /* Real 24H change fallback: when no 24h-old observed tick exists yet
       (history only started recording recently), use the UNDERLYING's
       verified previous close from the official RHJ fundamentals — the
       token tracks its underlying 1:1, so (token mid - prev close x
       multiplier) / (prev close x multiplier) is the asset's actual
       24H movement. Source-labeled for transparency. */
    if (row.change24hPct == null) {
      const prevClose = d.underlyingMcaps[m.address]?.previousClose ?? null;
      const mult = m.multiplier ?? 1;
      if (row.price != null && prevClose != null && prevClose > 0) {
        const ref = prevClose * mult;
        row.change24hPct = ((row.price - ref) / ref) * 100;
        row.dataSources.change24h = "RHJ fundamentals previous close";
      }
    } else {
      row.dataSources.change24h = "Engine price history (24h window)";
    }
    // sector classification of the UNDERLYING company: verified provider
    // metadata first, then the centralized manual-verified mapping,
    // else "Unknown" (provider names never leak to the frontend)
    const classification = resolveSector(
      m.underlyingSymbol ?? m.symbol,
      d.underlyingMeta[m.address]?.sector ?? null,
      d.underlyingMeta[m.address]?.industry ?? null,
    );
    return {
      ...row,
      sector: classification.sector,
      classificationSource: classification.source,
      industry: d.underlyingMeta[m.address]?.industry ?? null,
    };
  });
  rows.sort((a, b) => (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0));
  return NextResponse.json({ status: rows.length > 0 ? "live" : "empty", data: rows });
}