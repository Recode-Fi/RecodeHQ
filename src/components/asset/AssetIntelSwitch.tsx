"use client";

import { useChain } from "@/providers/chain-provider";
import { AssetIntelligenceView } from "./AssetIntelligenceView";
import { ChainAssetIntel, type ChainAssetRow } from "./ChainAssetIntel";
import { useSolanaMarkets } from "@/hooks/useSolana";
import { useArcMarkets } from "@/hooks/useArc";
import { useEvmNetMarkets } from "@/hooks/useEvmNet";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * Network-aware Asset Intelligence — the global network selector is
 * the single source of truth: Solana tokens on Solana, Arc contracts
 * on Arc, Ethereum/BSC/Arbitrum contracts via the EVM NET layer, and
 * the verified tokenized-RWA workspace on Robinhood/All.
 */
export function AssetIntelSwitch() {
  const { isSolana, isArc, evmNetChain, selectedLabel } = useChain();
  // Hooks run unconditionally (React rules); branches only choose views.
  const solana = useSolanaMarkets();
  const arc = useArcMarkets();
  const evmNet = useEvmNetMarkets(evmNetChain ?? "ethereum");

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

  if (evmNetChain) {
    const rows: ChainAssetRow[] = (evmNet.data ?? []).map((m) => ({
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
          <NetworkIcon id={evmNetChain} size={16} />
          Asset Intelligence · {selectedLabel} — {evmNetChain} contracts only
        </div>
        <ChainAssetIntel
          networkId={evmNetChain}
          networkName={evmNetChain === "ethereum" ? "Ethereum" : evmNetChain === "bsc" ? "BNB Smart Chain" : "Arbitrum One"}
          rows={rows}
          status={evmNet.status}
          emptyNote={`No verified ${evmNetChain} tokens match.`}
          subtitle={`Select a ${evmNetChain} token to view its live intelligence.`}
        />
      </div>
    );
  }

  return <AssetIntelligenceView />;
}
