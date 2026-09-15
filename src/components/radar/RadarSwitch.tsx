"use client";

import { useChain } from "@/providers/chain-provider";
import { RadarView } from "@/components/radar/RadarView";
import { SolanaRadar } from "@/components/solana/SolanaRadar";

/** Network-aware radar: Solana signals vs the EVM market map. */
export function RadarSwitch() {
  const { isSolana } = useChain();
  return isSolana ? <SolanaRadar /> : <RadarView />;
}