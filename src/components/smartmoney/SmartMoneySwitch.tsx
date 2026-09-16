"use client";

import { useChain } from "@/providers/chain-provider";
import { SmartMoneyView } from "@/components/smartmoney/SmartMoneyView";
import { SolanaSmartMoney } from "@/components/solana/SolanaSmartMoney";
import { ArcSmartMoney } from "@/components/arc/ArcSmartMoney";
import { EvmNetSmartMoney } from "@/components/evmnet/EvmNetSmartMoney";

/** Network-aware smart money: per-chain verified flow rankings. */
export function SmartMoneySwitch() {
  const { isSolana, isArc, evmNetChain } = useChain();
  if (isSolana) return <SolanaSmartMoney />;
  if (isArc) return <ArcSmartMoney />;
  if (evmNetChain) return <EvmNetSmartMoney chain={evmNetChain} />;
  return <SmartMoneyView />;
}