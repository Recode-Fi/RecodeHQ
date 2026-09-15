"use client";

import { createContext, useContext } from "react";
import type { WalletId } from "@/lib/wallets";

/**
 * Wallet connection context — shared by the provider, the Connect Wallet
 * modal and every wallet-aware control. Kept in its own module so the
 * modal and the provider never form an import cycle.
 */

export interface WalletContextValue {
  address: string | null;
  chainIdHex: string | null;
  connectedWallet: WalletId | null;
  connectingWallet: WalletId | null;
  error: string | null;
  installedRdns: string[];
  legacyInjected: boolean;
  walletModalOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => void;
  /** Explicit user action only - never automatic. */
  ensureChain: (targetHex?: string) => Promise<boolean>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
