"use client";

import { useParams } from "next/navigation";
import { WalletIntel } from "@/components/wallet/WalletIntel";
import { SolanaWalletIntel } from "@/components/solana/SolanaWalletIntel";
import { ArcWalletIntel } from "@/components/arc/ArcWalletIntel";
import { useChain } from "@/providers/chain-provider";
import { addressFamily } from "@/lib/types";

export default function WalletPage() {
  const params = useParams<{ address: string }>();
  const raw = (params?.address ?? "").trim();
  const family = addressFamily(raw);
  const { isArc } = useChain();

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

  // Address families never share logic: 0x… → EVM services (Arc when the
  // Arc network is selected), base58 → Solana RPC.
  if (family === "solana") return <SolanaWalletIntel address={raw} />;
  return isArc ? <ArcWalletIntel address={raw.toLowerCase()} /> : <WalletIntel address={raw.toLowerCase()} />;
}
