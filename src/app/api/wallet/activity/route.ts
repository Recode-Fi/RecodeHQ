import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { fetchWalletActivity } from "@/server/sync/services/onchainWalletService";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  if (!ADDR.test(address)) {
    return NextResponse.json({ status: "error", error: "Invalid address" }, { status: 400 });
  }
  try {
    const data = await fetchWalletActivity(address.toLowerCase());
    return NextResponse.json({ status: "live", data });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      error: err instanceof Error ? err.message : "Activity fetch failed",
    });
  }
}
