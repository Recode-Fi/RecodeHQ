import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { SYNC_CONFIG } from "@/server/sync/config";
import { getSyncStore } from "@/server/sync/store";
import { holderConcentration, whaleExposure, whaleFlows } from "@/server/sync/intelligence/whale";

export const dynamic = "force-dynamic";

/**
 * Whale intelligence — computed INTERNALLY from raw holder data:
 *   whaleUsd = holderTokenBalance × verifiedCurrentTokenPrice
 * Top-10/25/50 concentration, largest holders, whale USD exposure and
 * 24h whale inflow/outflow/net from verified on-chain transfers.
 * USD values are null whenever balance OR price is unavailable —
 * never zero, never a provider pre-calculated value.
 */
export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const addressParam = url.searchParams.get("address")?.trim().toLowerCase() ?? null;
  const windowHours = (() => {
    const n = Number(url.searchParams.get("windowHours"));
    return Number.isFinite(n) && n > 0 && n <= 168 ? n : 24;
  })();
  if (!symbol && !addressParam) {
    return NextResponse.json({ status: "empty", data: null, error: "symbol or address required" });
  }
  const d = getSyncStore().get();
  const market = addressParam
    ? d.markets[addressParam]
    : Object.values(d.markets).find((m) => (m.symbol ?? "").toUpperCase() === symbol);
  if (!market) {
    return NextResponse.json({ status: "empty", data: null, error: "symbol not indexed" });
  }
  const address = market.address;
  const price = d.prices[address]?.price ?? null;
  const priceSource = d.prices[address]?.source ?? null;
  const holders = d.holders[address] ?? null;
  const now = Date.now();
  const thresholdUsd = SYNC_CONFIG.whaleThresholdUsd;

  if (!holders || holders.top.length === 0) {
    return NextResponse.json({
      status: "empty",
      data: null,
      error: "No verified holder data for this token",
      providers: {
        primary: SYNC_CONFIG.indexerUrl ? "indexer" : "not-configured",
        fallback: "blockscout",
      },
    });
  }

  const entries = holders.top.map((t) => ({
    address: t.address,
    balance: t.balance,
    sharePct: t.sharePct,
  }));

  // Whale USD exposure + largest holders (computed internally, null-safe).
  const exposure = whaleExposure(entries, price, thresholdUsd);
  const largest = exposure.largest.slice(0, 25).map((h) => ({
    address: h.address,
    balance: h.balance,
    // provenance per value: computed from balance × verified price
    usd: h.usd,
    usdSource: price != null ? `computed: balance × ${priceSource ?? "verified price"}` : null,
  }));

  const top10 = holderConcentration(entries, 10);
  const top25 = holderConcentration(entries, 25);
  const top50 = holderConcentration(entries, 50);

  // Whale flows from raw on-chain transfers already in the store.
  const flows = whaleFlows(
    d.transactions
      .filter((t) => t.address === address)
      .map((t) => ({ ts: t.ts, action: t.action, usd: t.usd })),
    now,
    windowHours * 3_600_000,
    thresholdUsd,
  );

  const prov = holders.intel ?? null;
  const hasData = exposure.count > 0 || top10 != null || flows != null;

  return NextResponse.json({
    status: hasData ? "live" : "empty",
    data: hasData
      ? {
        symbol: market.symbol,
        address,
        concentration: {
          top10: top10?.value ?? null,
          top25: top25?.value ?? null,
          top50: top50?.value ?? null,
          coverage: { top10: top10?.coverage ?? 0, top25: top25?.coverage ?? 0, top50: top50?.coverage ?? 0 },
          basis: "Sum of verified holder share percentages (share of total supply)",
        },
        largest,
        whaleExposure: {
          usd: exposure.usd,
          count: exposure.count,
          thresholdUsd,
          basis: exposure.provenance.derivedFrom,
        },
        flows,
        price: { value: price, source: priceSource },
        provenance: {
          source: prov?.source ?? "robinhood-chain",
          provider: prov?.provider ?? "blockscout-fallback",
          verified: prov?.verified ?? false,
          confidence: prov?.confidence ?? null,
          updatedAt: holders.updatedAt,
          freshness: prov?.freshness ?? (now - holders.updatedAt <= 300_000 ? "live" : "stale"),
          sharePctDerived: prov?.sharePctDerived ?? false,
        },
      }
      : null,
  });
}