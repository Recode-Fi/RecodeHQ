import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { arcSmartMoney } from "@/server/arc/services/smartMoney";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const url = new URL(req.url);
  const windowHours = Math.min(
    720,
    Math.max(1, Number(url.searchParams.get("windowHours") ?? 24) || 24),
  );
  const wallets = arcSmartMoney(windowHours);
  return NextResponse.json({
    status: "live",
    data: wallets,
    ...(wallets.length === 0
      ? {
          error:
            "No verified Arc USDC flow events in this window yet — the engine scans recent blocks continuously.",
        }
      : {}),
  });
}