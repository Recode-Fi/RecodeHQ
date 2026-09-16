"use client";

import { useChain } from "@/providers/chain-provider";
import { MarketsTable } from "@/components/markets/MarketsTable";
import { UniverseSection } from "@/components/universe/UniverseSection";
import { SolanaMarketsTable } from "@/components/solana/SolanaMarketsTable";
import { ArcMarketsTable } from "@/components/arc/ArcMarketsTable";
import { EvmNetMarketsTable } from "@/components/evmnet/EvmNetMarketsTable";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * Network-aware Discover — the global network selector is the single
 * source of truth (same contract as the Markets tab): Solana shows
 * Solana markets, Arc shows Arc markets, Ethereum/BSC/Arbitrum show
 * their own EVM NET markets, EVM-RWA networks keep the verified
 * tokenized universe. No cross-chain substitution.
 */
export function DiscoverSwitch() {
  const { isSolana, isArc, evmNetChain, selectedLabel } = useChain();

  if (isSolana) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <NetworkIcon id="solana" size={16} />
          Discover · {selectedLabel} — live Solana market data
        </div>
        <SolanaMarketsTable />
      </div>
    );
  }

  if (isArc) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <NetworkIcon id="arc" size={16} />
          Discover · {selectedLabel} — live Arc market data (USDC-quoted pairs)
        </div>
        <ArcMarketsTable />
      </div>
    );
  }

  if (evmNetChain) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <NetworkIcon id={evmNetChain} size={16} />
          Discover · {selectedLabel} — live market data
        </div>
        <EvmNetMarketsTable chain={evmNetChain} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MarketsTable
        title="Discover"
        sub="Browse the verified tokenized universe — sort by size, volume, momentum or holders to find what's moving."
      />
      <UniverseSection />
    </div>
  );
}