"use client";

import { useChain } from "@/providers/chain-provider";
import { SmartMoneyView } from "@/components/smartmoney/SmartMoneyView";
import { SolanaSmartMoney } from "@/components/solana/SolanaSmartMoney";
import { ArcSmartMoney } from "@/components/arc/ArcSmartMoney";

/** Network-aware smart money: Solana net-flow, Arc net-USDC-flow, or the EVM ranking. */
export function SmartMoneySwitch() {
  const { isSolana, isArc } = useChain();
  if (isSolana) return <SolanaSmartMoney />;
  if (isArc) return <ArcSmartMoney />;
  return <SmartMoneyView />;
}