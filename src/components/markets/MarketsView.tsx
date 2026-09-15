"use client";

import { useChain } from "@/providers/chain-provider";
import { MarketsTable } from "./MarketsTable";
import { SolanaMarketsTable } from "@/components/solana/SolanaMarketsTable";

/**
 * Network-aware markets surface: the EVM screener for EVM networks /
 * All Networks (existing behavior preserved), the Solana screener when
 * the Solana network is selected. Chain logic stays in the registry —
 * this is only a family switch.
 */
export function MarketsView({
  title,
  sub,
  assetType,
  showFilters = true,
}: {
  title: string;
  sub?: string;
  assetType?: string;
  showFilters?: boolean;
}) {
  const { isSolana } = useChain();
  if (isSolana) return <SolanaMarketsTable />;
  return <MarketsTable title={title} sub={sub} assetType={assetType} showFilters={showFilters} />;
}