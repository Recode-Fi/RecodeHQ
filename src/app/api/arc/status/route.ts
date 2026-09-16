import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  return NextResponse.json(engine.status());
}