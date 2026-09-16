"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { WalletGate } from "./WalletGate";

/**
 * Terminal route guard: /app/** renders only when a compatible wallet
 * is connected. Otherwise the WALLET GATE replaces the shell. Provider
 * state (live connection) is the source of truth — never a stored
 * address alone. While providers hydrate: "Checking wallet…".
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const evm = useWallet();
  const sol = useSolanaWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[13px] text-muted">Checking wallet…</div>
      </div>
    );
  }
  if (!evm.address && !sol.address) {
    return <WalletGate variant="page" />;
  }
  return <>{children}</>;
}