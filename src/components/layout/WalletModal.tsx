"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@/providers/wallet-context";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { WALLETS } from "@/lib/wallets";
import { SOL_WALLETS } from "@/lib/solanaWallets";
import { ROBINHOOD_CHAIN_HEX, ROBINHOOD_CHAIN_NAME, isMobile } from "@/lib/walletCore";
import { shortAddr } from "@/lib/format";

/**
 * Connect Wallet modal - rendered through createPortal(document.body)
 * so it is ALWAYS viewport-positioned, never clipped by sticky headers
 * (backdrop-blur creates a fixed-position containing block), sidebars
 * or transformed page containers.
 *
 * Sizing: centered via fixed inset-0 flex; max-height uses dynamic
 * viewport units so it adapts to any browser height/zoom/mobile; the
 * content scrolls internally; body scroll is locked while open and
 * restored on close (scrollbar-width compensated to avoid layout shift).
 */
export function WalletModal() {
  const {
    walletModalOpen, closeWalletModal, error, address, chainIdHex, ensureChain,
  } = useWallet();
  const sol = useSolanaWallet();
  const [tab, setTab] = useState<"evm" | "solana">("evm");

  // Lock background scroll while open (with layout-shift compensation).
  useEffect(() => {
    if (!walletModalOpen) return;
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWalletModal();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      window.removeEventListener("keydown", onKey);
    };
  }, [walletModalOpen, closeWalletModal]);

  // nothing on the server / while closed
  if (!walletModalOpen || typeof document === "undefined") return null;

  const mobile = isMobile();
  const wrongNetwork = Boolean(address && chainIdHex && chainIdHex !== ROBINHOOD_CHAIN_HEX);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={closeWalletModal}
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
    >
      <div
        className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-sm flex-col overflow-hidden rounded-[10px] border border-line bg-surface shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-text">Connect Wallet</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Connect your wallet to access personalized RECODE features.
            </p>
          </div>
          <button
            type="button"
            onClick={closeWalletModal}
            className="rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[10px] text-muted transition-colors hover:text-text"
            aria-label="Close"
          >
            ESC
          </button>
        </div>

        {/* Family tabs — EVM and Solana wallets are separate systems. */}
        <div className="flex gap-1 border-b border-line px-5 pt-3">
          {(
            [
              { id: "evm", label: "Ethereum & EVM", count: WALLETS.length },
              { id: "solana", label: "Solana", count: SOL_WALLETS.length },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-[4px] border-b-2 px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                tab === t.id
                  ? "border-green text-green"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* scrollable middle: banners + wallet list always reachable */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {tab === "evm" ? (
            <>
              {error ? (
                <div className="rounded-[4px] border border-neg/30 bg-neg/10 px-3 py-2 text-[11.5px] text-neg">
                  {error}
                </div>
              ) : null}

              {wrongNetwork ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-[4px] border border-warn/30 bg-warn/10 px-3 py-2">
                  <span className="text-[11px] text-warn">Please switch to {ROBINHOOD_CHAIN_NAME}.</span>
                  <button
                    type="button"
                    onClick={() => void ensureChain(ROBINHOOD_CHAIN_HEX)}
                    className="rounded-[4px] border border-warn/40 px-2 py-1 text-[10.5px] font-semibold text-warn"
                  >
                    Switch
                  </button>
                </div>
              ) : null}

              {address ? <ConnectedState /> : <WalletList mobile={mobile} />}
            </>
          ) : (
            <>
              {sol.error ? (
                <div className="rounded-[4px] border border-neg/30 bg-neg/10 px-3 py-2 text-[11.5px] text-neg">
                  {sol.error}
                </div>
              ) : null}
              {sol.address ? <SolanaConnectedState /> : <SolanaWalletList />}
            </>
          )}
        </div>

        <div className="border-t border-line px-5 py-3 text-[10px] leading-relaxed text-faint">
          RECODE only requests standard wallet permissions (accounts). It never asks for private
          keys, seed phrases or passwords.
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WalletList({ mobile }: { mobile: boolean }) {
  const { connect, connectingWallet, installedRdns } = useWallet();
  return (
    <ul className="space-y-1.5">
      {WALLETS.map((w) => {
        const installed = installedRdns.includes(w.rdns);
        const busy = connectingWallet === w.id;
        const mobilePath = mobile && w.deepLink != null;
        let note: string | null = null;
        if (busy) note = "Connecting…";
        else if (mobilePath) note = "Open in wallet";
        else if (!installed) note = "Not installed";
        return (
          <li key={w.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void connect(w.id)}
              className={`flex w-full items-center gap-3 rounded-[6px] border px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-panel-2 disabled:opacity-70 ${
                busy ? "border-green/40 bg-panel" : "border-line bg-panel"
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-line-soft bg-panel-2 [&_svg]:h-7 [&_svg]:w-7"
                dangerouslySetInnerHTML={{ __html: w.icon }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-text">{w.name}</span>
                {note ? (
                  <span
                    className={`block text-[10.5px] ${
                      busy ? "text-green" : installed || mobilePath ? "text-faint" : "text-warn"
                    }`}
                  >
                    {note}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] text-faint">→</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ConnectedState() {
  const { address, connectedWallet } = useWallet();
  const wallet = WALLETS.find((w) => w.id === connectedWallet);
  return (
    <div>
      <div className="flex items-center gap-3 rounded-[6px] border border-green/30 bg-green-soft px-3 py-2.5">
        {wallet ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center [&_svg]:h-6 [&_svg]:w-6"
            dangerouslySetInnerHTML={{ __html: wallet.icon }}
          />
        ) : null}
        <span className="tnum text-[12.5px] text-green">
          Connected · {address ? shortAddr(address) : ""}
        </span>
      </div>
    </div>
  );
}

function SolanaWalletList() {
  const { connect, connectingWallet, installed } = useSolanaWallet();
  return (
    <div>
      <p className="mb-2 text-[10.5px] text-faint">
        Solana wallets connect read-only — RECODE reads your public key and on-chain balances.
      </p>
      <ul className="space-y-1.5">
        {SOL_WALLETS.map((w) => {
          const isInstalled = installed.includes(w.id);
          const busy = connectingWallet === w.id;
          let note: string | null = null;
          if (busy) note = "Connecting…";
          else if (!isInstalled) note = "Not installed";
          return (
            <li key={w.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect(w.id)}
                className={`flex w-full items-center gap-3 rounded-[6px] border px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-panel-2 disabled:opacity-70 ${
                  busy ? "border-green/40 bg-panel" : "border-line bg-panel"
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-line-soft bg-panel-2 [&_svg]:h-7 [&_svg]:w-7"
                  dangerouslySetInnerHTML={{ __html: w.icon }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-text">{w.name}</span>
                  <span
                    className={`block text-[10.5px] ${
                      busy ? "text-green" : isInstalled ? "text-faint" : "text-warn"
                    }`}
                  >
                    {note ?? w.note}
                  </span>
                </span>
                <span className="text-[11px] text-faint">→</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SolanaConnectedState() {
  const { address, connectedWallet } = useSolanaWallet();
  const wallet = SOL_WALLETS.find((w) => w.id === connectedWallet);
  return (
    <div>
      <div className="flex items-center gap-3 rounded-[6px] border border-green/30 bg-green-soft px-3 py-2.5">
        {wallet ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center [&_svg]:h-6 [&_svg]:w-6"
            dangerouslySetInnerHTML={{ __html: wallet.icon }}
          />
        ) : null}
        <span className="min-w-0">
          <span className="tnum block text-[12.5px] text-green">
            Solana connected · {address ? shortAddr(address) : ""}
          </span>
          <span className="block text-[10px] text-faint">Base58 address · read-only session</span>
        </span>
      </div>
      <a
        href={`/app/wallet/${address ?? ""}`}
        className="mt-2.5 block rounded-[4px] border border-line bg-panel py-1.5 text-center text-[11.5px] text-muted transition-colors hover:text-text"
      >
        Open Solana Wallet Intelligence →
      </a>
    </div>
  );
}

