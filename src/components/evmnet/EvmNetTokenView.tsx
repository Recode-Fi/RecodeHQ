"use client";

import { useEvmNetDirectLookup } from "@/hooks/useEvmNet";
import type { EvmNetChain } from "@/services/evmNetService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum } from "@/lib/format";

const EXPLORERS: Record<EvmNetChain, string> = {
  ethereum: "https://etherscan.io",
  bsc: "https://bscscan.com",
  arbitrum: "https://arbiscan.io",
};

export function EvmNetTokenView({ chain, address }: { chain: EvmNetChain; address: string }) {
  const { data, status } = useEvmNetDirectLookup(chain, address);
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-[12.5px] text-muted">
        Resolving contract on {chain}…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold">Token not found or unavailable</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          No verified market data is currently available for {address} on {chain}.
        </p>
      </div>
    );
  }
  const t = data.token;
  const m = data.metadata;
  return (
    <div className="mx-auto max-w-[1000px]">
      <Panel>
        <PanelHeader title={m?.symbol ?? "Token"} sub={m?.name ?? undefined} />
        <div className="flex items-center gap-3 px-4 pb-4">
          <AssetLogo symbol={t?.symbol ?? m?.symbol} url={t?.logoUrl ?? null} size={36} />
          <div className="text-[12.5px] text-muted">
            {chain} · {data.pairs} pair{data.pairs === 1 ? "" : "s"} ·{" "}
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
          <Kv label="24H" value={t?.change24hPct != null ? fmtPct(t.change24hPct) : "—"} tone={changeTone(t?.change24hPct ?? null)} />
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
        <a
          href={`${EXPLORERS[chain]}/address/${m?.address ?? address}`}
          target="_blank"
          rel="noreferrer"
          className="px-4 pb-4 inline-block text-[11.5px] text-green/80 hover:underline"
        >
          View on explorer ↗
        </a>
      </Panel>
    </div>
  );
}

function Kv({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className={`${mono ? "font-mono text-[11.5px] break-all" : ""} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
