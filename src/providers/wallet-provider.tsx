"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WalletId } from "@/lib/wallets";
import {
  connectWalletById,
  ensureChainOn,
  legacyEthereum,
  resolveWalletProvider,
  type DiscoveredProvider,
  type Eip1193Provider,
  ROBINHOOD_CHAIN_HEX,
} from "@/lib/walletCore";
import { WalletContext, type WalletContextValue } from "@/providers/wallet-context";
import { WalletModal } from "@/components/layout/WalletModal";

// Re-exported so existing wallet-aware components keep their imports stable.
export { useWallet } from "@/providers/wallet-context";

/**
 * ============================================================
 * WALLET PROVIDER - manual-only wallet connection.
 * Nothing touches a wallet API until the user clicks
 * "Connect Wallet" and picks a wallet in the modal.
 * The modal renders through a global portal (document.body),
 * so no header/sidebar/layout container can clip it.
 * ============================================================
 */

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<WalletId | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<WalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredProvider[]>([]);
  const [legacyInjected, setLegacyInjected] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // EIP-6963 passive discovery - no wallet API calls, no popups.
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<DiscoveredProvider>).detail;
      if (!detail?.info?.rdns || !detail.provider) return;
      setDiscovered((prev) =>
        prev.some((p) => p.info.rdns === detail.info.rdns) ? prev : [...prev, detail],
      );
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const eth = legacyEthereum();
    setLegacyInjected(eth != null);

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts && accounts.length > 0) setAddress(accounts[0].toLowerCase());
      else {
        setAddress(null);
        setConnectedWallet(null);
      }
    };
    const onChain = (...args: unknown[]) => setChainIdHex(args[0] as string);
    eth?.on?.("accountsChanged", onAccounts);
    eth?.on?.("chainChanged", onChain);
    // Silent reconnect for previously-authorized wallets: eth_accounts
    // never pops a dialog — an authorized connection restores access
    // (gate stays open on refresh); unauthorized stays disconnected.
    void (eth
      ?.request?.({ method: "eth_accounts" }) as Promise<string[] | unknown> | undefined)
      ?.then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0) {
          setAddress(String(accounts[0]).toLowerCase());
        }
      })
      .catch(() => {
        /* passive restore failures leave the gate state untouched */
      });
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      eth?.removeListener?.("accountsChanged", onAccounts);
      eth?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const openWalletModal = useCallback(() => {
    setError(null);
    setWalletModalOpen(true);
    // Re-request announcements (some wallets announce late).
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }, []);

  const closeWalletModal = useCallback(() => {
    setWalletModalOpen(false);
    setConnectingWallet(null);
  }, []);

  /** Explicit user action only (modal wallet row click). */
  const connect = useCallback(
    async (walletId: WalletId) => {
      setError(null);
      setConnectingWallet(walletId);
      const result = await connectWalletById(walletId, discovered);
      if ("deepLink" in result) {
        window.location.href = result.deepLink;
        return;
      }
      if ("error" in result) {
        setError(result.error);
        setConnectingWallet(null);
        return;
      }
      setAddress(result.address);
      setChainIdHex(result.chainIdHex);
      setConnectedWallet(result.wallet);
      setConnectingWallet(null);
    },
    [discovered],
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setConnectedWallet(null);
    setError(null);
  }, []);

  /** Explicit user action only - never called automatically. */
  const ensureChain = useCallback(
    async (targetHex: string = ROBINHOOD_CHAIN_HEX): Promise<boolean> => {
      const provider: Eip1193Provider | null = connectedWallet
        ? (resolveWalletProvider(connectedWallet, discovered)?.provider ?? legacyEthereum())
        : legacyEthereum();
      if (!provider) return false;
      const res = await ensureChainOn(provider, targetHex, chainIdHex);
      if (res.ok) setChainIdHex(targetHex);
      else if (res.error) setError(res.error);
      return res.ok;
    },
    [chainIdHex, connectedWallet, discovered],
  );

  const installedRdns = useMemo(() => discovered.map((d) => d.info.rdns), [discovered]);

  const value = useMemo<WalletContextValue>(
    () => ({
      address, chainIdHex, connectedWallet, connectingWallet, error, installedRdns,
      legacyInjected, walletModalOpen, openWalletModal, closeWalletModal,
      connect, disconnect, ensureChain,
    }),
    [
      address, chainIdHex, connectedWallet, connectingWallet, error, installedRdns,
      legacyInjected, walletModalOpen, openWalletModal, closeWalletModal,
      connect, disconnect, ensureChain,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {/* Global portal modal - lives at the provider root, escapes every
          stacking/clip container (sticky headers with backdrop-blur, etc.). */}
      <WalletModal />
    </WalletContext.Provider>
  );
}
