import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getOnDemandRpc } from "@/server/solana/rpcClient";
import { fetchSolanaWalletActivityPage } from "@/server/solana/services/walletIntel";
import { isValidSolanaAddress } from "@/lib/base58";

export const dynamic = "force-dynamic";

/**
 * Solana wallet activity — REAL normalized transaction records
 * (signature → parsed transaction → classified record with SOL/token
 * amounts, program, counterparty, USD where verified). Pagination via
 * the `before` signature cursor; `limit` bounded (max 50). No browser-
 * side transaction parsing is needed.
 */
export async function GET(request: Request) {
  getSolanaSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { status: "error", error: "Invalid Solana address (base58 expected, not 0x…)" },
      { status: 400 },
    );
  }
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 25;
  const before = url.searchParams.get("before")?.trim() || null;
  try {
    const data = await fetchSolanaWalletActivityPage(getOnDemandRpc(), address, {
      limit,
      before,
    });
    return NextResponse.json({
      status: data.chainOnline ? "live" : "unavailable",
      data,
      ...(data.chainOnline ? {} : { error: data.errors[0] }),
    });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      error: err instanceof Error ? err.message : "Activity fetch failed",
    });
  }
}
