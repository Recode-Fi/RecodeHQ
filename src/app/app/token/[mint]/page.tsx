import type { Metadata } from "next";
import { SolanaAssetView } from "@/components/solana/SolanaAssetView";
import { isValidSolanaAddress } from "@/lib/base58";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}): Promise<Metadata> {
  const { mint } = await params;
  return { title: `${mint.slice(0, 6)}… · Solana Token` };
}

/**
 * Solana token intelligence — route by base58 mint address. EVM
 * asset pages stay under /app/asset/[symbol]; the two families
 * never share address logic.
 */
export default async function SolanaTokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const address = (mint ?? "").trim();
  if (!isValidSolanaAddress(address)) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">Invalid Solana mint address</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          &quot;{address || "—"}&quot; is not a valid base58 Solana mint. EVM contracts belong
          under /app/asset — the two address families are never processed with each other&apos;s
          logic.
        </p>
      </div>
    );
  }
  return <SolanaAssetView mint={address} />;
}