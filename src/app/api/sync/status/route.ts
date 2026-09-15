import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getMarketSyncEngine();
  engine.ensureStarted();
  return NextResponse.json(engine.getStatus());
}