import { NextResponse } from "next/server";
import { getEvmNetEngine, parseEvmNetChain } from "@/server/evmnet/registry";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const key = parseEvmNetChain(chain);
  if (!key) {
    return NextResponse.json({ status: "error", data: null, error: "Unknown EVM net chain" }, { status: 404 });
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  // Fresh on-chain identity probe so mode/chainId reflect current RPC state.
  await engine.rpc.verifyChain();
  return NextResponse.json(engine.status());
}