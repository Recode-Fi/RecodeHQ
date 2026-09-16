"use client";

import { useChain } from "@/providers/chain-provider";
import { RadarView } from "@/components/radar/RadarView";
import { SolanaRadar } from "@/components/solana/SolanaRadar";
import { ArcRadar } from "@/components/arc/ArcRadar";
import { EvmNetRadar } from "@/components/evmnet/EvmNetRadar";

/** Network-aware radar: per-chain signal feeds for every supported network. */
export function RadarSwitch() {
  const { isSolana, isArc, evmNetChain } = useChain();
  if (isSolana) return <SolanaRadar />;
  if (isArc) return <ArcRadar />;
  if (evmNetChain) return <EvmNetRadar chain={evmNetChain} />;
  return <RadarView />;
}