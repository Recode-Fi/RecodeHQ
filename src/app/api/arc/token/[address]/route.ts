import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { arcDirectLookup } from "@/server/arc/services/walletIntel";

export const dynamic = "force-dynamic";

/** Direct Arc contract lookup: /api/arc/token/0x… (chain-aware, EVM family). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const raw = (address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid Arc contract address" },
      { status: 400 },
    );
  }
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const result = await arcDirectLookup(engine.rpc, engine.dexscreener, raw);
  if (!result) {
    return NextResponse.json(
      { status: "error", data: null, error: "Invalid Arc contract address" },
      { status: 400 },
    );
  }
  const hasMarket = result.token?.priceUsd != null || result.pairs > 0;
  if (!result.metadata?.isContract && !hasMarket && result.token == null) {
    return NextResponse.json({
      status: "empty",
      data: result,
      error: "Token not found or unavailable from current providers.",
    });
  }
  return NextResponse.json({ status: "live", data: result });
}