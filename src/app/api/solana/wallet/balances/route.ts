import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getOnDemandRpc } from "@/server/solana/rpcClient";
import { fetchSolanaWalletBalances } from "@/server/solana/services/walletIntel";
import { isValidSolanaAddress } from "@/lib/base58";

export const dynamic = "force-dynamic";

/**
 * Solana wallet balances — native SOL + SPL token accounts, read
 * directly from mainnet RPC. Routing by address family happens in the
 * client; this route only ever receives base58 Solana addresses.
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
    const data = await fetchSolanaWalletBalances(getOnDemandRpc(), getSolanaSyncEngine(), address);
    return NextResponse.json({
      status: data.chainOnline ? "live" : "unavailable",
      data,
    });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      error: err instanceof Error ? err.message : "Balance fetch failed",
    });
  }
}

