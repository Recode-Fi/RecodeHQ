import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";

export const dynamic = "force-dynamic";

/** Solana intelligence-layer status (mirrors /api/sync/status semantics). */
export async function GET() {
  getSolanaSyncEngine().ensureStarted();
  return NextResponse.json(getSolanaSyncEngine().status());
}