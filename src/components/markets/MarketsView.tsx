"use client";

import { useChain } from "@/providers/chain-provider";
import { MarketsTable } from "./MarketsTable";
import { SolanaMarketsTable } from "@/components/solana/SolanaMarketsTable";
import { ArcMarketsTable } from "@/components/arc/ArcMarketsTable";

/**
 * Network-aware markets surface: the EVM screener for EVM networks /
 * All Networks (existing behavior preserved), the Solana screener when
 * the Solana network is selected. Chain logic stays in the registry â€”
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
  const { isSolana, isArc } = useChain();
  if (isSolana) return <SolanaMarketsTable />;
  if (isArc) return <ArcMarketsTable />;
  return (
    <MarketsTable
      title={title}
      sub={sub}
      assetType={assetType}
      showFilters={showFilters}
      networkId="robinhood-chain"
    />
  );
}
