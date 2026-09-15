import { NextResponse } from "next/server";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { getSyncStore } from "@/server/sync/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  getMarketSyncEngine().ensureStarted();
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? null;
  const all = getSyncStore().get().transactions;
  const symbolRows = symbol ? all.filter((t) => (t.symbol ?? "").toUpperCase() === symbol) : all;
  // Defensive serving dedup: legacy rows may carry unstable ids, so collapse
  // by both id and event identity (hash + wallet + action + amount). Legit
  // transfers within one tx (different wallet/amount) remain separate.
  const byId = new Set<string>();
  const byEvent = new Set<string>();
  const rows: typeof all = [];
  for (const t of symbolRows) {
    const eventKey = `${t.hash}:${t.wallet}:${t.action}:${t.amount ?? ""}`;
    if (byId.has(t.id) || byEvent.has(eventKey)) continue;
    byId.add(t.id);
    byEvent.add(eventKey);
    rows.push(t);
  }
  return NextResponse.json({
    status: rows.length > 0 ? "live" : "empty",
    data: rows.slice(0, 60),
  });
}