"use client";

import { useChain } from "@/providers/chain-provider";
import { SmartMoneyView } from "@/components/smartmoney/SmartMoneyView";
import { SolanaSmartMoney } from "@/components/solana/SolanaSmartMoney";

/** Network-aware smart money: Solana net-flow ranking vs the EVM ranking. */
export function SmartMoneySwitch() {
  const { isSolana } = useChain();
  return isSolana ? <SolanaSmartMoney /> : <SmartMoneyView />;
}