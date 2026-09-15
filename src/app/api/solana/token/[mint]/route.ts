import { NextResponse } from "next/server";
import { getSolanaSyncEngine } from "@/server/solana/engine";
import { getSolanaStore } from "@/server/solana/store";
import { holderConcentration, tokenDetail } from "@/server/solana/services/rows";
import { SOLANA_ADDRESS_RE } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Solana token intelligence for one mint address (base58 — never
 * processed as an EVM contract). Includes verified market state,
 * holder concentration (Solana RPC largest accounts), recent whale
 * events and the stored price sparkline.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  getSolanaSyncEngine().ensureStarted();
  const { mint } = await params;
  const address = (mint ?? "").trim();
  if (!SOLANA_ADDRESS_RE.test(address)) {
    return NextResponse.json(
      { status: "error", error: "Invalid Solana mint address" },
      { status: 400 },
    );
  }
  const d = getSolanaStore().get();
  const detail = tokenDetail(d, address);
  if (!detail) {
    return NextResponse.json({
      status: "empty",
      data: null,
      error: "Mint not indexed — it may exist on-chain but is outside the tracked universe",
    });
  }
  const conc10 = holderConcentration(detail.holders, 10);
  const price = detail.token.priceUsd;
  return NextResponse.json({
    status: detail.dataStatus === "unavailable" ? "syncing" : detail.dataStatus,
    data: {
      chain: "solana",
      ...detail,
      concentration: {
        top10: conc10.value,
        coverage: conc10.coverage,
        basis: "Sum of largest-account share percentages (share of verified supply)",
      },
      priceBasis:
        price != null && detail.token.sources.length > 0
          ? `verified DEX price (${detail.token.sources.join(", ")})`
          : null,
    },
  });
}