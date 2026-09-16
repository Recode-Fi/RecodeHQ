import { NextResponse } from "next/server";
import { getEvmNetEngine, parseEvmNetChain } from "@/server/evmnet/registry";
import { getEvmNetStore } from "@/server/evmnet/store";

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
  const store = getEvmNetStore(key).get();
  return NextResponse.json({ status: "live", data: store.radar });
}