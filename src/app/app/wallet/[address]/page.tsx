"use client";

import { useParams } from "next/navigation";
import { WalletIntel } from "@/components/wallet/WalletIntel";
import { SolanaWalletIntel } from "@/components/solana/SolanaWalletIntel";
import { addressFamily } from "@/lib/types";

export default function WalletPage() {
  const params = useParams<{ address: string }>();
  const raw = (params?.address ?? "").trim();
  const family = addressFamily(raw);

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

  // Address families never share logic: 0x… → EVM services, base58 → Solana RPC.
  return family === "solana" ? (
    <SolanaWalletIntel address={raw} />
  ) : (
    <WalletIntel address={raw.toLowerCase()} />
  );
}
