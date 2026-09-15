"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { shortAddr } from "@/lib/format";
import { getWallet } from "@/lib/wallets";
import { getSolWallet } from "@/lib/solanaWallets";
import { ROBINHOOD_CHAIN_HEX, ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_NAME } from "@/lib/walletCore";

/**
 * Connect Wallet control - MANUAL ONLY.
 * Disconnected: "Connect Wallet" opens the wallet selection modal.
 * Connected: compact chip with the official wallet icon; dropdown with
 * address, network, copy, explorer and disconnect. Never requests
 * anything on its own.
 */
export function ConnectWalletButton() {
  const { address, connectedWallet, chainIdHex, openWalletModal, disconnect, ensureChain, connectingWallet } =
    useWallet();
  const sol = useSolanaWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wallet = connectedWallet ? getWallet(connectedWallet) : null;
  const solWallet = sol.connectedWallet ? getSolWallet(sol.connectedWallet) : null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const switchChain = async () => {
    await ensureChain(ROBINHOOD_CHAIN_HEX);
  };

  if (!address && !sol.address) {
    return (
      <>
        <button
          type="button"
          onClick={openWalletModal}
          disabled={connectingWallet != null || sol.connectingWallet != null}
          className="flex items-center gap-2 rounded-[4px] btn-accent px-3 py-1.5 text-[11.5px] font-semibold text-green transition-colors disabled:opacity-60"
        >
          {connectingWallet != null || sol.connectingWallet != null ? "Connecting…" : "Connect Wallet"}
        </button>
      </>
    );
  }

  /* Solana connected — separate family chip, never mixed with EVM logic. */
  if (!address && sol.address && solWallet) {
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[4px] border border-green/30 bg-green-soft px-2.5 py-1.5 text-[11.5px] font-medium text-green"
          title="Solana wallet"
        >
          <span className="[&_svg]:h-4 [&_svg]:w-4" dangerouslySetInnerHTML={{ __html: solWallet.icon }} />
          <span className="tnum">{shortAddr(sol.address)}</span>
          <span className="text-[9px] uppercase text-faint">SOL</span>
        </button>
        {open ? (
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-[6px] border border-line bg-surface p-1.5 shadow-xl shadow-black/40">
            <div className="px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-faint">
                Solana · {solWallet.name}
              </div>
              <div className="tnum mt-1 break-all text-[11.5px] text-text">{sol.address}</div>
              <div className="mt-1 text-[10.5px] text-muted">Network: Solana mainnet-beta · read-only</div>
            </div>
            <a
              href={`/app/wallet/${sol.address}`}
              className="block w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel hover:text-text"
            >
              Wallet Intelligence →
            </a>
            <a
              href={`https://solscan.io/account/${sol.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel hover:text-text"
            >
              View on explorer ↗
            </a>
            <button
              type="button"
              onClick={() => {
                sol.disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel hover:text-neg"
            >
              Disconnect Wallet
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const wrong = chainIdHex != null && chainIdHex !== ROBINHOOD_CHAIN_HEX;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[4px] border border-green/30 bg-green-soft px-2.5 py-1.5 text-[11.5px] font-medium text-green"
        title="Wallet"
      >
        {wallet ? (
          <span className="[&_svg]:h-4 [&_svg]:w-4" dangerouslySetInnerHTML={{ __html: wallet.icon }} />
        ) : null}
        <span className="tnum">{shortAddr(address)}</span>
        {wrong ? <span className="text-[9px] uppercase text-warn">wrong network</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-[6px] border border-line bg-surface p-1.5 shadow-xl shadow-black/40">
          <div className="px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wider text-faint">
              Connected{wallet ? ` · ${wallet.name}` : ""}
            </div>
            <div className="tnum mt-1 break-all text-[11.5px] text-text">{address}</div>
            <div className="mt-1 text-[10.5px] text-muted">
              Network: {wrong ? `${ROBINHOOD_CHAIN_NAME} required` : `${ROBINHOOD_CHAIN_NAME} (${ROBINHOOD_CHAIN_ID})`}
            </div>
          </div>
          {wrong ? (
            <button
              type="button"
              onClick={() => void switchChain()}
              className="w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-warn hover:bg-panel"
            >
              Switch to {ROBINHOOD_CHAIN_NAME}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(address ?? "").catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel hover:text-text"
          >
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <a
            href={`https://robinhoodchain.blockscout.com/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-[4px] px-2 py-1.5 text-[12px] text-muted hover:bg-panel hover:text-text"
          >
            View on explorer ↗
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel hover:text-neg"
          >
            Disconnect Wallet
          </button>
        </div>
      ) : null}
    </div>
  );
}

