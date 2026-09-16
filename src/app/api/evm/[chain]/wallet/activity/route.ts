import { NextResponse } from "next/server";
import { getEvmNetEngine, getEvmNetOnDemandRpc, parseEvmNetChain } from "@/server/evmnet/registry";
import { fetchEvmNetWalletActivity } from "@/server/evmnet/services/walletActivity";
import { evmNetConfig } from "@/server/evmnet/config";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const key = parseEvmNetChain(chain);
  if (!key) {
    return NextResponse.json({ status: "error", data: null, error: "Unknown EVM net chain" }, { status: 404 });
  }
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid wallet address (0x…, 40 hex)" },
      { status: 400 },
    );
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  const conf = evmNetConfig(key);
  const latest = await getEvmNetOnDemandRpc(key).latestBlock();
  if (latest == null) {
    return NextResponse.json({
      status: "unavailable",
      data: {
        chain: key,
        address,
        records: [],
        recordsCount: 0,
        fromBlock: null,
        toBlock: null,
        updatedAt: Date.now(),
        errors: ["RPC unavailable — activity window cannot be read"],
      },
    });
  }
  const blocks = Math.min(
    300,
    Math.max(10, Number(url.searchParams.get("blocks") ?? conf.whaleScanBlocks * 3) || 60),
  );
  const data = await fetchEvmNetWalletActivity(
    key,
    getEvmNetOnDemandRpc(key),
    address,
    latest,
    blocks,
  );
  return NextResponse.json({ status: data.recordsCount > 0 ? "live" : "empty", data });
}