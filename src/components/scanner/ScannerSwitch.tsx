"use client";

import { useChain } from "@/providers/chain-provider";
import { ScannerView } from "@/components/scanner/ScannerView";
import { SolanaScannerView } from "@/components/solana/SolanaScannerView";

/**
 * Network-aware scanner: the EVM contract/token scanner for EVM networks /
 * All Networks (existing behavior preserved), the Solana Market Scanner when
 * the Solana network is selected.
 */
export function ScannerSwitch({ initial }: { initial?: string }) {
  const { isSolana } = useChain();
  return isSolana ? <SolanaScannerView initialMint={initial} /> : <ScannerView initial={initial} />;
}