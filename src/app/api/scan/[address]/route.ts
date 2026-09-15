import { NextResponse } from "next/server";
import { scanAddress } from "@/server/sync/services/scanService";

export const dynamic = "force-dynamic";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

/**
 * RECODE Scan aggregation endpoint — one normalized response per address.
 * All RPC/indexer/explorer/market reads happen server-side with caching;
 * unavailable metrics are null (never fake zeros).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const addr = (address ?? "").trim().toLowerCase();
  if (!ADDR.test(addr)) {
    return NextResponse.json({ status: "error", data: null, error: "Invalid address" }, { status: 400 });
  }
  try {
    const data = await scanAddress(addr);
    return NextResponse.json({
      status: data.network.online ? "live" : "stale",
      data,
    });
  } catch (err) {
    return NextResponse.json({
      status: "unavailable",
      data: null,
      error: err instanceof Error ? err.message : "Scan failed",
    });
  }
}