"use client";

import { SolanaAssetView } from "@/components/solana/SolanaAssetView";
import { useArcDirectLookup } from "@/hooks/useArc";
import { useChain } from "@/providers/chain-provider";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum } from "@/lib/format";

/**
 * Token-route router — explicit chain context, never address-shape
 * guessing alone: base58 → Solana token intelligence; 0x… on Arc →
 * Arc token intelligence; 0x… on a non-Arc EVM network → guidance
 * to /app/asset (EVM symbol workspace). Families never mix logic.
 */
export function TokenRouter({ address }: { address: string }) {
  const { isArc, selectedLabel } = useChain();

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    if (isArc) return <ArcTokenView address={address.toLowerCase()} />;
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">EVM contract on {selectedLabel}</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          &quot;{address}&quot; is an EVM (0x…) contract. EVM asset intelligence lives under
          the Asset Intelligence workspace (/app/asset) — or select the <strong>Arc</strong>{" "}
          network to analyze it with the Arc pipeline. The two address families never share
          logic.
        </p>
        <a href="/app/assets" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
          → Asset Intelligence
        </a>
      </div>
    );
  }

  return <SolanaAssetView mint={address} />;
}

type ArcLookup = NonNullable<ReturnType<typeof useArcDirectLookup>["data"]>;

function ArcTokenView({ address }: { address: string }) {
  const { data, status } = useArcDirectLookup(address);
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-[12.5px] text-muted">
        Resolving Arc contract…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">Token not found or unavailable</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          No verified Arc market data is currently available for {address}.
        </p>
      </div>
    );
  }
  const t = data.token;
  const m = data.metadata;
  return (
    <div className="mx-auto max-w-[1000px]">
      <Panel>
        <PanelHeader title={m?.symbol ?? "Arc token"} sub={m?.name ?? undefined} />
        <div className="flex items-center gap-3 px-4 pb-4">
          <AssetLogo symbol={t?.symbol ?? m?.symbol} url={t?.logoUrl ?? null} size={36} />
          <div className="text-[12.5px] text-muted">
            Arc · chain 5042 · {data.pairs} pair{data.pairs === 1 ? "" : "s"} ·{" "}
            {m?.isContract ? "contract" : "not verified as contract"}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4 text-[12.5px] md:grid-cols-4">
          <Kv label="Contract" value={m?.address ?? address} mono />
          <Kv label="Price" value={t?.priceUsd != null ? fmtUsd(t.priceUsd) : "—"} />
          <Kv label="Market Cap" value={t?.marketCap != null ? fmtUsd(t.marketCap) : "—"} />
          <Kv label="FDV" value={t?.fdv != null ? fmtUsd(t.fdv) : "—"} />
          <Kv label="Liquidity" value={t?.liquidity != null ? fmtUsd(t.liquidity) : "—"} />
          <Kv label="24H Volume" value={t?.volume24h != null ? fmtUsd(t.volume24h) : "—"} />
          <Kv
            label="24H"
            value={t?.change24hPct != null ? fmtPct(t.change24hPct) : "—"}
            tone={changeTone(t?.change24hPct ?? null)}
          />
          <Kv label="Txns 24H" value={t?.txns24h != null ? fmtNum(t.txns24h) : "—"} />
          <Kv label="DEX" value={t?.dexId ?? "—"} />
          <Kv label="Decimals" value={m?.decimals != null ? String(m.decimals) : "—"} />
        </div>
        {data.pairs === 0 && m?.isContract ? (
          <div className="px-4 pb-4 text-[12px] text-warn">
            Contract found, but no verified market data is currently available.
          </div>
        ) : null}
        <div className="px-4 pb-4 text-[11px] text-faint">Source: {data.source}</div>
      </Panel>
    </div>
  );
}

function Kv({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`${mono ? "font-mono text-[11.5px] break-all" : ""} ${tone ?? ""}`}>{value}</div>
    </div>
  );
}