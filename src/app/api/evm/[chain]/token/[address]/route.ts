import { NextResponse } from "next/server";
import { getEvmNetEngine, getEvmNetOnDemandRpc, parseEvmNetChain } from "@/server/evmnet/registry";
import { evmNetDirectLookup } from "@/server/evmnet/services/directLookup";

export const dynamic = "force-dynamic";

/** Direct contract lookup per EVM net chain (exact-match, live). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address: raw } = await params;
  const key = parseEvmNetChain(chain);
  if (!key) {
    return NextResponse.json({ status: "error", data: null, error: "Unknown EVM net chain" }, { status: 404 });
  }
  const address = (raw ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid contract address" },
      { status: 400 },
    );
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  const result = await evmNetDirectLookup(key, getEvmNetOnDemandRpc(key), engine.dexscreener, address);
  if (!result) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid contract address" },
      { status: 400 },
    );
  }
  const hasMarket = result.token?.priceUsd != null || result.pairs > 0;
  if (!result.metadata?.isContract && !hasMarket) {
    return NextResponse.json({
      status: "empty",
      data: result,
      error: "Token not found or unavailable from current providers.",
    });
  }
  return NextResponse.json({ status: "live", data: result });
}