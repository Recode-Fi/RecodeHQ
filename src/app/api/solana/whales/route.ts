import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { toWhaleFeed } from "@/server/solana/services/rows";

export const dynamic = "force-dynamic";

/**
 * Solana whale feed — large balance movements observed between
 * largest-account snapshots (Solana RPC). Classification is
 * rule-based: paired in/out → transfer, unpaired →
 * accumulation/distribution. USD only when a verified price exists.
 */
export async function GET(request: Request) {
  getSolanaSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const mint = url.searchParams.get("mint")?.trim() ?? null;
  const d = getSolanaStore().get();
  let events = toWhaleFeed(d);
  if (mint) events = events.filter((e) => e.mint === mint);
  return NextResponse.json({
    // Engine running but no verified events yet → "live" with null data so the
    // UI renders the honest empty message instead of an endless skeleton.
    status: events.length > 0 || d.updatedAt != null ? "live" : "syncing",
    data: events.length > 0 ? events : null,
    error: events.length === 0 ? "No whale events observed yet" : undefined,
  });
}