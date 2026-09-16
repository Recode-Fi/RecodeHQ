"use client";

import { useChain } from "@/providers/chain-provider";
import { ScannerView } from "@/components/scanner/ScannerView";
import { SolanaScannerView } from "@/components/solana/SolanaScannerView";
import { ArcScannerView } from "@/components/arc/ArcScannerView";

/**
 * Network-aware scanner: the EVM contract/token scanner for EVM networks /
 * All Networks (existing behavior preserved), the Solana Market Scanner when
 * the Solana network is selected, and the Arc contract scanner for Arc.
 */
export function ScannerSwitch({ initial }: { initial?: string }) {
  const { isSolana, isArc } = useChain();
  if (isSolana) return <SolanaScannerView initialMint={initial} />;
  if (isArc) return <ArcScannerView initial={initial} />;
  return <ScannerView initial={initial} />;
}