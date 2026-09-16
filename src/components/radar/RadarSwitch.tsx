"use client";

import { useChain } from "@/providers/chain-provider";
import { RadarView } from "@/components/radar/RadarView";
import { SolanaRadar } from "@/components/solana/SolanaRadar";
import { ArcRadar } from "@/components/arc/ArcRadar";

/** Network-aware radar: Solana signals, Arc signals, or the EVM market map. */
export function RadarSwitch() {
  const { isSolana, isArc } = useChain();
  if (isSolana) return <SolanaRadar />;
  if (isArc) return <ArcRadar />;
  return <RadarView />;
}