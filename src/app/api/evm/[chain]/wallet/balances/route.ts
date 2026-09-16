import { NextResponse } from "next/server";
import { getEvmNetEngine, getEvmNetOnDemandRpc, parseEvmNetChain } from "@/server/evmnet/registry";
import { fetchEvmNetWalletBalances } from "@/server/evmnet/services/walletIntel";

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
  const address = (new URL(req.url).searchParams.get("address") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid wallet address (0x…, 40 hex)" },
      { status: 400 },
    );
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  const data = await fetchEvmNetWalletBalances(
    key,
    getEvmNetOnDemandRpc(key),
    engine.dexscreener,
    address,
  );
  return NextResponse.json({ status: "live", data });
}