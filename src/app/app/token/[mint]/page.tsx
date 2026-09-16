import type { Metadata } from "next";
import { TokenRouter } from "@/components/asset/TokenRouter";
import { isValidSolanaAddress } from "@/lib/base58";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}): Promise<Metadata> {
  const { mint } = await params;
  return { title: `${mint.slice(0, 6)}… · Token` };
}

/**
 * Token intelligence — explicit chain routing: base58 → Solana token
 * intelligence; 0x… → Arc token intelligence when the Arc network is
 * selected (else guidance to the EVM asset workspace). The two
 * address families never share processing logic.
 */
export default async function TokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const address = (mint ?? "").trim();
  const isEvm = /^0x[0-9a-fA-F]{40}$/.test(address);
  if (!isEvm && !isValidSolanaAddress(address)) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">Invalid token address</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          &quot;{address || "—"}&quot; is neither a valid base58 Solana mint nor a valid EVM
          (0x…) contract. The two address families are never processed with each
          other&apos;s logic.
        </p>
      </div>
    );
  }
  return <TokenRouter address={address} />;
}
