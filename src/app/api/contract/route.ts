import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";
import { analyzeContract } from "@/server/sync/services/contractService";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (symbol) {
    // Symbol lookup: resolve the verified registry contract, then run the
    // same on-chain analysis. Used by Asset Intelligence's Contract tab.
    const store = getSyncStore().get();
    const market = Object.values(store.markets).find(
      (m) => (m.symbol ?? "").toUpperCase() === symbol,
    );
    if (!market) {
      return NextResponse.json({ status: "error", error: "Unknown symbol" }, { status: 404 });
    }
    try {
      const data = await analyzeContract(market.address);
      return NextResponse.json({ status: "live", data });
    } catch (err) {
      return NextResponse.json({
        status: "unavailable",
        error: err instanceof Error ? err.message : "Contract analysis failed",
      });
    }
  }
  const address = (url.searchParams.get("address") ?? "").trim();
  if (!ADDR.test(address)) {
    return NextResponse.json({ status: "error", error: "Invalid address" }, { status: 400 });
  }
  try {
    const data = await analyzeContract(address.toLowerCase());
    return NextResponse.json({ status: "live", data });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      error: err instanceof Error ? err.message : "Contract analysis failed",
    });
  }
}
