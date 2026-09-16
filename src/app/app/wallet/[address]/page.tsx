"use client";

import { useParams } from "next/navigation";
import { WalletIntel } from "@/components/wallet/WalletIntel";
import { SolanaWalletIntel } from "@/components/solana/SolanaWalletIntel";
import { ArcWalletIntel } from "@/components/arc/ArcWalletIntel";
import { EvmNetWalletIntel } from "@/components/evmnet/EvmNetWalletIntel";
import { useChain } from "@/providers/chain-provider";
import { addressFamily } from "@/lib/types";

export default function WalletPage() {
  const params = useParams<{ address: string }>();
  const raw = (params?.address ?? "").trim();
  const family = addressFamily(raw);
  const { isArc, evmNetChain, selected, selectedLabel } = useChain();

  if (!family) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">Invalid wallet address</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          &quot;{raw || "—"}&quot; is neither a valid EVM address (42-character 0x-prefixed
          hexadecimal) nor a valid Solana address (32–44 character base58).
        </p>
        <a href="/app/wallets" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
          ← Back to Wallet Intelligence search
        </a>
      </div>
    );
  }

  // Address families never share logic: base58 → Solana RPC; 0x… → the
  // selected network's EVM pipeline (EVM NET / Arc / Robinhood). With
  // "All Networks" the chain is ambiguous — never inferred from 0x alone.
  if (family === "solana") return <SolanaWalletIntel address={raw} />;
  if (evmNetChain) return <EvmNetWalletIntel chain={evmNetChain} address={raw.toLowerCase()} />;
  if (isArc) return <ArcWalletIntel address={raw.toLowerCase()} />;
  if (selected === "robinhood-chain") return <WalletIntel address={raw.toLowerCase()} />;
  return (
    <div className="mx-auto max-w-2xl py-20 text-center">
      <h1 className="text-lg font-semibold">Select an EVM network</h1>
      <p className="mt-2 text-[12.5px] text-muted">
        &quot;{raw}&quot; is an EVM (0x…) address but no specific EVM network is selected —
        currently viewing: {selectedLabel}. Select Ethereum, BSC, Arbitrum, Arc or Robinhood
        Chain to inspect this wallet on that chain. The same address can exist on multiple
        EVM networks, so the chain is never inferred from the address alone.
      </p>
      <a href="/app/wallets" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
        ← Back to Wallet Intelligence search
      </a>
    </div>
  );
}
