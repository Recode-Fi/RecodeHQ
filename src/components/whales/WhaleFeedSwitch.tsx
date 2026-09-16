"use client";

import { useChain } from "@/providers/chain-provider";
import { WhaleFeed } from "@/components/whales/WhaleFeed";
import { SolanaWhaleFeed } from "@/components/solana/SolanaWhaleFeed";
import { ArcWhaleFeed } from "@/components/arc/ArcWhaleFeed";
import { EvmNetWhaleFeed } from "@/components/evmnet/EvmNetWhaleFeed";

/** Network-aware whale feed: per-chain event feeds for every supported network. */
export function WhaleFeedSwitch() {
  const { isSolana, isArc, evmNetChain } = useChain();
  if (isSolana) return <SolanaWhaleFeed />;
  if (isArc) return <ArcWhaleFeed />;
  if (evmNetChain) return <EvmNetWhaleFeed chain={evmNetChain} />;
  return <WhaleFeed />;
}