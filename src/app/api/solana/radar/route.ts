import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";

export const dynamic = "force-dynamic";

/**
 * Solana RECODE Radar — rule-based signals computed over verified
 * stored data: unusual volume, liquidity changes, large transfers,
 * whale activity, significant price movement, newly active pairs.
 * Every signal carries its derivation basis; nothing is fabricated.
 */
export async function GET() {
  getSolanaSyncEngine().ensureStarted();
  const d = getSolanaStore().get();
  return NextResponse.json({
    status: d.radar.length > 0 ? "live" : "syncing",
    data: d.radar.length > 0 ? d.radar : null,
  });
}