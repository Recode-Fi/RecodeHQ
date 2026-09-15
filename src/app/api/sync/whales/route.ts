import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { SYNC_CONFIG } from "@/server/sync/config";
import { deriveFlowKinds } from "@/server/sync/whale/sync";
import type { WhaleFeedMeta } from "@/services/recodeService";

export const dynamic = "force-dynamic";

/**
 * Live whale activity — verified on-chain flows only, merged from
 * the WhaleActivityProvider chain (Blockscout explorer → Goldsky
 * subgraph → RPC getLogs → optional REST indexer) plus rule-based
 * accumulation/distribution derivation. Every row carries its
 * source and timestamp; classification uses DEX-swap evidence only.
 */
export async function GET(request: Request) {
  const engine = getMarketSyncEngine();
  engine.ensureStarted();
  const url = new URL(request.url);
  const minUsdRaw = Number(url.searchParams.get("minUsd"));
  const minUsd = Number.isFinite(minUsdRaw) && minUsdRaw > 0 ? minUsdRaw : null;

  const status = engine.getStatus();
  const d = getSyncStore().get();
  const now = Date.now();

  const whales = d.whales;
  // Rule-based accumulation/distribution on verified transfer direction.
  const derived = deriveFlowKinds(d.transactions, now);
  const all = [...whales, ...derived];
  const rows = minUsd != null ? all.filter((w) => (w.usd ?? 0) >= minUsd) : all;

  const counts = {
    buy: all.filter((w) => w.kind === "buy").length,
    sell: all.filter((w) => w.kind === "sell").length,
    transfer: all.filter((w) => w.kind === "transfer").length,
    accumulation: all.filter((w) => w.kind === "accumulation").length,
    distribution: all.filter((w) => w.kind === "distribution").length,
  };

  const meta: WhaleFeedMeta = {
    explorerTxBase: SYNC_CONFIG.blockscoutUrl ? `${SYNC_CONFIG.blockscoutUrl}/tx/` : null,
    whaleThresholdUsd: SYNC_CONFIG.whaleThresholdUsd,
    engineMode: status.mode,
    updatedAt: now,
    providers: [
      {
        id: "blockscout",
        label: "Explorer (Blockscout v2)",
        configured: status.providers.blockscout.configured,
        ok: status.providers.blockscout.ok,
        lastSuccess: status.providers.blockscout.lastSuccess,
      },
      {
        id: "goldsky-subgraph",
        label: "Goldsky subgraph",
        configured: Boolean(SYNC_CONFIG.goldskySubgraphUrl),
        ok: SYNC_CONFIG.goldskySubgraphUrl ? null : null,
        lastSuccess: null,
      },
      {
        id: "rpc-getlogs",
        label: "RPC getLogs",
        configured: status.providers.rpc.configured,
        ok: status.providers.rpc.ok,
        lastSuccess: status.providers.rpc.lastSuccess,
      },
      {
        id: "robinhood-indexer",
        label: "RH indexer",
        configured: status.providers.indexer.configured,
        ok: status.providers.indexer.ok,
        lastSuccess: status.providers.indexer.lastSuccess,
      },
    ],
    counts,
  };

  return NextResponse.json({
    status: rows.length > 0 ? "live" : all.length > 0 ? "empty" : "empty",
    data: rows,
    meta,
  });
}
