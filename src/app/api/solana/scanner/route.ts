import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { buildScannerRows } from "@/server/solana/services/scanner";

export const dynamic = "force-dynamic";

/**
 * Solana Market Scanner — enriched per-token rows with calculated
 * buy/sell ratio, liquidity/volume deltas (engine's own measurement
 * history), whale and smart-money activity tallies. Empty store →
 * "syncing" so the UI renders an honest loading state.
 */
export async function GET() {
  getSolanaSyncEngine().ensureStarted();
  const d = getSolanaStore().get();
  const rows = buildScannerRows(d);
  const anyLive = rows.some((r) => r.dataStatus === "live");
  return NextResponse.json({
    status: rows.length === 0 ? "syncing" : anyLive ? "live" : "stale",
    data: rows.length === 0 ? null : rows,
  });
}