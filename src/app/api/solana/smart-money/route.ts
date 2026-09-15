import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { smartMoneyRankings } from "@/server/solana/services/scanner";

export const dynamic = "force-dynamic";

/**
 * Solana Smart Money — wallets ranked by verified net flow
 * (accumulation − distribution) from the Solana whale pipeline.
 * Transfers are direction-neutral and excluded from the net.
 */
export async function GET(request: Request) {
  getSolanaSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const hoursParam = Number(url.searchParams.get("windowHours"));
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 && hoursParam <= 720 ? hoursParam : 24;
  const d = getSolanaStore().get();
  const ranked = smartMoneyRankings(d, Date.now(), hours * 3_600_000);
  return NextResponse.json({
    // Engine running but no verified flows yet → "live" with null data so the
    // UI renders the honest empty message instead of an endless skeleton.
    status: ranked.length > 0 || d.updatedAt != null ? "live" : "syncing",
    data: ranked.length > 0 ? ranked : null,
    windowHours: hours,
    error:
      ranked.length === 0
        ? "No verified whale flows on Solana in this window yet — flows appear only when a verified largest-account balance delta crosses the whale threshold."
        : undefined,
    basis:
      "Verified largest-account balance deltas (Solana RPC). Net = accumulation − distribution; transfers excluded. ROI/win-rate require per-wallet trade attribution — unavailable, not estimated.",
  });
}