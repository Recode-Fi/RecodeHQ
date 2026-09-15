"use client";

import { createContext, useContext } from "react";
import type { SolanaWalletId } from "@/lib/solanaWallets";

/**
 * Solana wallet context — deliberately separate from the EVM
 * wallet context so an EVM address can never be confused with a
 * Solana address. Shared by the provider, the Connect Wallet
 * modal and wallet-aware controls (no import cycles).
 */

export interface SolanaWalletContextValue {
  /** Base58 Solana public key (never an 0x EVM address). */
  address: string | null;
  connectedWallet: SolanaWalletId | null;
  connectingWallet: SolanaWalletId | null;
  error: string | null;
  installed: SolanaWalletId[];
  connect: (walletId: SolanaWalletId) => Promise<void>;
  disconnect: () => void;
}

export const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(null);

export function useSolanaWallet(): SolanaWalletContextValue {
  const ctx = useContext(SolanaWalletContext);
  if (!ctx) throw new Error("useSolanaWallet must be used inside SolanaWalletProvider");
  return ctx;
}