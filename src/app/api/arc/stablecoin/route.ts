import { NextResponse } from "next/server";
import { getArcSyncEngine } from "@/server/arc/engine";
import { getArcStore } from "@/server/arc/store";

export const dynamic = "force-dynamic";

/** Arc stablecoin intelligence: USDC flow events (system-emitter backed). */
export async function GET(req: Request) {
  const engine = getArcSyncEngine();
  engine.ensureStarted();
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const wallet = url.searchParams.get("wallet")?.toLowerCase();
  const store = getArcStore().get();
  let events = store.stablecoin;
  if (wallet) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json(
        { status: "error", data: null, error: "Invalid wallet address" },
        { status: 400 },
      );
    }
    events = events.filter((e) => e.wallet === wallet);
  }
  const inflow = events
    .filter((e) => e.kind === "inflow" || e.kind === "mint")
    .reduce((s, e) => s + e.amountUsdc, 0);
  const outflow = events
    .filter((e) => e.kind === "outflow" || e.kind === "burn")
    .reduce((s, e) => s + e.amountUsdc, 0);
  return NextResponse.json({
    status: "live",
    data: {
      chain: "arc",
      gasSymbol: "USDC",
      usdcContract: "0x3600000000000000000000000000000000000000",
      events: events.slice(0, limit),
      eventsCount: events.length,
      windowInflowUsdc: inflow,
      windowOutflowUsdc: outflow,
      windowNetUsdc: inflow - outflow,
      basis:
        "Arc EIP-7708 native-USDC Transfer logs (system emitter) — face-value USDC; each event carries its transaction hash.",
      updatedAt: store.updatedAt,
    },
  });
}