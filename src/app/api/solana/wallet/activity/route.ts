import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { fetchSolanaWalletActivity } from "@/server/solana/services/walletIntel";
import { isValidSolanaAddress } from "@/lib/base58";

export const dynamic = "force-dynamic";

/**
 * Solana wallet activity — real signature history from the chain
 * (signature, block timestamp, status). No transfer direction is
 * invented: un-interpreted signature records are the honest unit
 * of activity without a dedicated indexer.
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
  try {
    const data = await fetchSolanaWalletActivity(getSolanaSyncEngine().rpc, address);
    return NextResponse.json({
      status: data.available ? "live" : "unavailable",
      data,
    });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      error: err instanceof Error ? err.message : "Activity fetch failed",
    });
  }
}
