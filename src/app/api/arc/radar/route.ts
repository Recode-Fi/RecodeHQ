import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcStore } from "@/server/arc/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const store = getArcStore().get();
  return NextResponse.json({ status: "live", data: store.radar });
}