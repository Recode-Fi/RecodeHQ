"use client";

import { useChain } from "@/providers/chain-provider";
import { SolanaAssetView } from "@/components/solana/SolanaAssetView";
import { EvmNetTokenView } from "@/components/evmnet/EvmNetTokenView";

/**
 * Token-route router — explicit chain context, never address-shape
 * guessing alone: base58 → Solana token intelligence; 0x… on an
 * EVM-net chain → that chain's live lookup; 0x… elsewhere →
 * guidance to the EVM asset workspace. Families never mix logic.
 */
export function TokenRouter({ address }: { address: string }) {
  const { evmNetChain, selectedLabel } = useChain();

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    if (evmNetChain) return <EvmNetTokenView chain={evmNetChain} address={address.toLowerCase()} />;
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">EVM contract on {selectedLabel}</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          &quot;{address}&quot; is an EVM (0x…) contract. Select Ethereum, BSC, Arbitrum or Arc
          to analyze it with that chain&apos;s pipeline — or use the Asset Intelligence
          workspace for tokenized RWA assets. The same contract can exist on multiple EVM
          networks; the chain is never inferred from the address alone.
        </p>
        <a href="/app/assets" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
          → Asset Intelligence
        </a>
      </div>
    );
  }

  return <SolanaAssetView mint={address} />;
}
