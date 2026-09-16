import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcStore } from "@/server/arc/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const store = getArcStore().get();
  // Cold-instance warm-up (bounded) — same contract as EVM NET whales.
  if (store.whales.length === 0) {
    await Promise.race([
      engine.warmWhales(),
      new Promise((resolve) => setTimeout(resolve, 12_000)),
    ]);
  }
  const fresh = getArcStore().get();
  return NextResponse.json({ status: "live", data: fresh.whales });
}