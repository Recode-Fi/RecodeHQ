"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  installedSolanaWallets,
  resolveSolanaProvider,
  type SolanaWalletId,
} from "@/lib/solanaWallets";
import { SolanaWalletContext, type SolanaWalletContextValue } from "./solana-wallet-context";

/**
 * ============================================================
 * SOLANA WALLET PROVIDER - manual-only, read-only connection.
 * Fully separate from the EVM wallet provider (window.ethereum).
 * Nothing touches a Solana provider API until the user clicks a
 * wallet in the modal. Connection requests the public key only —
 * no signing, no message approval, no transactions.
 * ============================================================
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<SolanaWalletId | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<SolanaWalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<SolanaWalletId[]>([]);

  useEffect(() => {
    setInstalled(installedSolanaWallets());
  }, []);

  const connect = useCallback(async (walletId: SolanaWalletId) => {
    setError(null);
    setConnectingWallet(walletId);
    try {
      const provider = resolveSolanaProvider(walletId);
      if (!provider?.connect) {
        setError(
          `${walletId === "phantom" ? "Phantom" : "Solflare"} was not detected in this browser. Install the extension, then try again.`,
        );
        setConnectingWallet(null);
        return;
      }
      const res = await provider.connect();
      const pub = res?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      if (!pub) {
        setError("The wallet did not return a public key.");
        setConnectingWallet(null);
        return;
      }
      setAddress(pub);
      setConnectedWallet(walletId);
      setConnectingWallet(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection was rejected";
      setError(msg.includes("User") ? "Connection request rejected in the wallet." : msg);
      setConnectingWallet(null);
    }
  }, []);

  const disconnect = useCallback(() => {
    try {
      if (connectedWallet) resolveSolanaProvider(connectedWallet)?.disconnect?.();
    } catch {
      /* provider disconnect failures never block local state */
    }
    setAddress(null);
    setConnectedWallet(null);
    setError(null);
  }, [connectedWallet]);

  const value = useMemo<SolanaWalletContextValue>(
    () => ({ address, connectedWallet, connectingWallet, error, installed, connect, disconnect }),
    [address, connectedWallet, connectingWallet, error, installed, connect, disconnect],
  );

  return <SolanaWalletContext.Provider value={value}>{children}</SolanaWalletContext.Provider>;
}