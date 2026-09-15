"use client";

import { useChain } from "@/providers/chain-provider";
import { WhaleFeed } from "@/components/whales/WhaleFeed";
import { SolanaWhaleFeed } from "@/components/solana/SolanaWhaleFeed";

/** Network-aware whale feed: Solana events vs the EVM whale feed. */
export function WhaleFeedSwitch() {
  const { isSolana } = useChain();
  return isSolana ? <SolanaWhaleFeed /> : <WhaleFeed />;
}