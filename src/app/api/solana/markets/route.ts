import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { toRows } from "@/server/solana/services/rows";

export const dynamic = "force-dynamic";

/**
 * Solana market screener — verified live DEX market data from the
 * Solana intelligence layer. Empty store → status "syncing" (the
 * engine just booted) so the UI renders an honest loading state.
 */
export async function GET() {
  getSolanaSyncEngine().ensureStarted();
  const d = getSolanaStore().get();
  const rows = toRows(d);
  const anyLive = rows.some((r) => r.dataStatus === "live");
  return NextResponse.json({
    status: rows.length === 0 ? "syncing" : anyLive ? "live" : "stale",
    data: rows.length === 0 ? null : rows,
  });
}