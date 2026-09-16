"use client";

import { useChain } from "@/providers/chain-provider";
import { WhaleFeed } from "@/components/whales/WhaleFeed";
import { SolanaWhaleFeed } from "@/components/solana/SolanaWhaleFeed";
import { ArcWhaleFeed } from "@/components/arc/ArcWhaleFeed";

/** Network-aware whale feed: Solana events, Arc USDC events, or the EVM feed. */
export function WhaleFeedSwitch() {
  const { isSolana, isArc } = useChain();
  if (isSolana) return <SolanaWhaleFeed />;
  if (isArc) return <ArcWhaleFeed />;
  return <WhaleFeed />;
}