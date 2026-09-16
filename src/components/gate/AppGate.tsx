"use client";

import { useEffect, useState } from "react";
import { useChain } from "@/providers/chain-provider";
import { useWallet } from "@/providers/wallet-provider";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { gateStatus } from "@/lib/gate";
import { WalletGate } from "./WalletGate";

/**
 * Terminal route guard: /app/** renders only when a compatible wallet
 * is connected AND verified on the selected network's chain (EVM) or a
 * Solana wallet is verified (Solana family). While disconnected or on
 * a wrong network, the WALLET GATE replaces the shell — with the
 * network switch requiring explicit user approval. Provider state is
 * the source of truth — never a stored address alone.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const evm = useWallet();
  const sol = useSolanaWallet();
  const { selected } = useChain();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  const status = gateStatus({
    mounted,
    selected,
    evmAddress: evm.address,
    solAddress: sol.address,
    evmChainIdHex: evm.chainIdHex,
  });

  if (status.kind !== "ready") {
    return <WalletGate variant="page" />;
  }
  return <>{children}</>;
}