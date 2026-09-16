"use client";

import { useChain } from "@/providers/chain-provider";
import { AssetIntelligenceView } from "./AssetIntelligenceView";
import { ChainAssetIntel, type ChainAssetRow } from "./ChainAssetIntel";
import { useSolanaMarkets } from "@/hooks/useSolana";
import { useArcMarkets } from "@/hooks/useArc";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * Network-aware Asset Intelligence — the global network selector is
 * the single source of truth: Solana tokens on Solana, Arc contracts
 * on Arc, the verified tokenized-RWA workspace on EVM networks.
 */
export function AssetIntelSwitch() {
  const { isSolana, isArc, selectedLabel } = useChain();
  // Hooks run unconditionally (React rules); branches only choose views.
  const solana = useSolanaMarkets();
  const arc = useArcMarkets();

  if (isSolana) {
    const rows: ChainAssetRow[] = (solana.data ?? []).map((m) => ({
      id: m.mint,
      symbol: m.symbol,
      name: m.name,
      logoUrl: m.logoUrl,
      priceUsd: m.price,
      marketCap: m.marketCap,
      fdv: m.fdv,
      liquidity: m.liquidity,
      volume24h: m.volume24h,
      change24hPct: m.change24hPct,
      txns24h: m.txns24h,
      dexLabel: m.dexId,
      detailHref: `/app/token/${m.mint}`,
      sources: m.sources,
    }));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <NetworkIcon id="solana" size={16} />
          Asset Intelligence · {selectedLabel} — Solana tokens only
        </div>
        <ChainAssetIntel
          networkId="solana"
          networkName="Solana"
          rows={rows}
          status={solana.status}
          emptyNote="No verified Solana tokens match."
          subtitle="Select a Solana token to view its live intelligence."
        />
      </div>
    );
  }

  if (isArc) {
    const rows: ChainAssetRow[] = (arc.data ?? []).map((m) => ({
      id: m.address,
      symbol: m.symbol,
      name: m.name,
      logoUrl: m.logoUrl,
      priceUsd: m.priceUsd,
      marketCap: m.marketCap,
      fdv: m.fdv,
      liquidity: m.liquidity,
      volume24h: m.volume24h,
      change24hPct: m.change24hPct,
      txns24h: m.txns24h,
      dexLabel: m.dexId,
      detailHref: `/app/token/${m.address}`,
      sources: m.sources,
    }));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <NetworkIcon id="arc" size={16} />
          Asset Intelligence · {selectedLabel} — Arc contracts only (USDC gas)
        </div>
        <ChainAssetIntel
          networkId="arc"
          networkName="Arc"
          rows={rows}
          status={arc.status}
          emptyNote="No verified Arc tokens match."
          subtitle="Select an Arc token to view its live intelligence."
        />
      </div>
    );
  }

  return <AssetIntelligenceView />;
}
