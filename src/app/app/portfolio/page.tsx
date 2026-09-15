"use client";

import { WalletIntel } from "@/components/wallet/WalletIntel";
import { useWallet } from "@/providers/wallet-provider";
import { useChain } from "@/providers/chain-provider";
import { Tag } from "@/components/ui/primitives";

export default function PortfolioPage() {
  const { address, openWalletModal, connectingWallet } = useWallet();
  const { selectedLabel } = useChain();

  if (!address) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold">My Portfolio</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          Connect your wallet to read live on-chain holdings on Robinhood Chain. RECODE requests
          read-only access - it never asks for signatures, keys or seed phrases.
        </p>
        <button
          type="button"
          onClick={openWalletModal}
          disabled={connectingWallet != null}
          className="mt-5 rounded-[4px] border border-green/40 bg-green-soft px-6 py-2.5 text-[13px] font-semibold text-green disabled:opacity-60"
        >
          Connect Wallet
        </button>
        <p className="mt-4 text-[10.5px] text-faint">Network view: {selectedLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Tag tone="green">READ-ONLY PORTFOLIO</Tag>
      </div>
      <WalletIntel address={address} />
    </div>
  );
}
