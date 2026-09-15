import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { holderConcentration } from "@/server/solana/services/rows";
import { directLookup } from "@/server/solana/services/directLookup";
import { isValidSolanaAddress } from "@/lib/base58";

export const dynamic = "force-dynamic";

/**
 * Solana token intelligence — DIRECT mint lookup (arbitrary valid CA,
 * not limited to the tracked universe):
 *   1. Validate base58 + 32-byte checksum (offline, zero provider calls)
 *   2. Live provider resolution (DexScreener pairs + Solana RPC
 *      metadata/holders), with a short-lived server cache
 *   3. Verified values only; unavailable fields stay null
 *
 * Response contract:
 *   400 + "Invalid Solana mint address"        — malformed input
 *   status "live"/"stale" + data               — market resolved
 *   status "empty" + reason "no-market"        — mint exists, no pair
 *   status "empty" + reason "not-found"        — unresolvable
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  getSolanaSyncEngine().ensureStarted();
  const { mint } = await params;
  const address = (mint ?? "").trim();
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { status: "error", error: "Invalid Solana mint address" },
      { status: 400 },
    );
  }

  const engine = getSolanaSyncEngine();
  const result = await directLookup(address, {
    dexscreener: engine.dexscreener,
    rpc: engine.rpc,
    store: getSolanaStore(),
  });

  if (result.status === "mint-only") {
    return NextResponse.json({
      status: "empty",
      reason: "no-market",
      data: {
        chain: "solana",
        mint: result.mint,
        metadata: result.metadata,
        pairsTotal: 0,
      },
      error: "Solana mint found, but no verified market pair is currently available.",
    });
  }
  if (result.status === "not-found") {
    return NextResponse.json({
      status: "empty",
      reason: "not-found",
      data: null,
      error: "Token not found or unavailable from current providers.",
    });
  }

  const token = result.token as NonNullable<typeof result.token>;
  const conc10 = result.holders
    ? holderConcentration(result.holders, 10)
    : { value: null as number | null, coverage: 0 };

  return NextResponse.json({
    status: "live",
    data: {
      chain: "solana",
      direct: true,
      token,
      metadata: result.metadata,
      holders: result.holders,
      concentration: {
        top10: conc10.value,
        coverage: conc10.coverage,
        basis: "Sum of largest-account share percentages (share of verified supply)",
      },
      holdersTotal: null, // public Solana RPC exposes no global holder count — never estimated
      pairs: result.pairs,
      pairsTotal: result.pairsTotal,
      whales: getSolanaStore()
        .get()
        .whales.filter((w) => w.mint === address)
        .slice(0, 25),
      errors: result.errors,
      priceBasis:
        token.priceUsd != null
          ? `verified DEX price (${[...result.sources, "direct-lookup"].join(", ")})`
          : null,
      dataStatus: "live",
      sparkline: getSolanaStore().get().priceHistory[address]?.map((p) => p.p) ?? [],
      resolvedAt: result.resolvedAt,
    },
  });
}