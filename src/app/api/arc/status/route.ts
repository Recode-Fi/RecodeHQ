import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  // Fresh on-chain identity probe so mode/chainId reflect current RPC state.
  await engine.rpc.verifyChain();
  return NextResponse.json(engine.status());
}