import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcOnDemandRpc } from "@/server/arc/rpcClient";
import { fetchArcWalletActivity } from "@/server/arc/services/walletActivity";
import { ARC_CONFIG } from "@/server/arc/config";

export const dynamic = "force-dynamic";

/**
 * Arc wallet activity: wallet-adjacent native-USDC Transfer logs
 * (EIP-7708 system emitter) over a bounded recent-block window.
 * Honest limitation: without an Arc indexer, history depth is limited
 * to the scanned window — stated explicitly, never papered over.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid Arc wallet address (0x…, 40 hex)" },
      { status: 400 },
    );
  }
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const latest = await getArcOnDemandRpc().latestBlock();
  if (latest == null) {
    return NextResponse.json({
      status: "unavailable",
      data: {
        chain: "arc",
        address,
        records: [],
        recordsCount: 0,
        fromBlock: null,
        toBlock: null,
        updatedAt: Date.now(),
        errors: ["Arc RPC unavailable — activity window cannot be read"],
      },
    });
  }
  const blocks = Math.min(
    300,
    Math.max(10, Number(url.searchParams.get("blocks") ?? ARC_CONFIG.whaleScanBlocks * 4) || 120),
  );
  const data = await fetchArcWalletActivity(getArcOnDemandRpc(), address, latest, blocks);
  return NextResponse.json({ status: data.recordsCount > 0 ? "live" : "empty", data });
}