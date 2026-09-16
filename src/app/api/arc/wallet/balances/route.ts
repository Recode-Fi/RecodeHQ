import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcOnDemandRpc } from "@/server/arc/rpcClient";
import { fetchArcWalletBalances } from "@/server/arc/services/walletIntel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = (new URL(req.url).searchParams.get("address") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid Arc wallet address (0x…, 40 hex)" },
      { status: 400 },
    );
  }
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const data = await fetchArcWalletBalances(getArcOnDemandRpc(), engine.dexscreener, address);
  return NextResponse.json({ status: "live", data });
}