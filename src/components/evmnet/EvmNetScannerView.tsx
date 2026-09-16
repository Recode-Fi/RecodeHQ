"use client";

import { useState } from "react";
import { useEvmNetDirectLookup, useEvmNetMarkets } from "@/hooks/useEvmNet";
import type { EvmNetChain } from "@/services/evmNetService";
import { EvmNetMarketsTable } from "./EvmNetMarketsTable";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum } from "@/lib/format";

const NAMES: Record<EvmNetChain, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Smart Chain",
  arbitrum: "Arbitrum One",
};

const EXPLORERS: Record<EvmNetChain, string> = {
  ethereum: "https://etherscan.io",
  bsc: "https://bscscan.com",
  arbitrum: "https://arbiscan.io",
};

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

/** EVM NET Scanner — market table + direct live contract lookup. */
export function EvmNetScannerView({ chain, initial }: { chain: EvmNetChain; initial?: string }) {
  const [input, setInput] = useState(initial ?? "");
  const [lookup, setLookup] = useState<string | null>(
    initial && EVM_RE.test(initial) ? initial.toLowerCase() : null,
  );
  const direct = useEvmNetDirectLookup(chain, lookup);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    setLookup(EVM_RE.test(v) ? v.toLowerCase() : v ? v : null);
  };

  const invalid = lookup != null && !EVM_RE.test(lookup);
  useEvmNetMarkets(chain); // keep markets warm for search fallback

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={`${NAMES[chain].toUpperCase()} CONTRACT SCANNER`}
          right={<span className="text-[11px] text-faint">{NAMES[chain]} mainnet · live lookup</span>}
        />
        <form onSubmit={submit} className="flex gap-2 px-4 pb-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a 0x… contract address, or search symbol / name…"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-text outline-none placeholder:text-faint focus:border-green/60"
          />
          <button
            type="submit"
            className="rounded-md bg-green px-4 py-2 text-[12.5px] font-semibold text-black hover:opacity-90"
          >
            SCAN
          </button>
        </form>
        {invalid ? (
          <div className="px-4 pb-4 text-[12.5px] text-warn">Invalid contract address</div>
        ) : null}
        {lookup && EVM_RE.test(lookup) ? (
          <div className="px-4 pb-4">
            {direct.status === "loading" ? (
              <div className="py-8 text-center text-[12.5px] text-muted">Resolving {NAMES[chain]} contract…</div>
            ) : direct.data ? (
              <EvmNetDirectCard chain={chain} data={direct.data} />
            ) : (
              <div className="py-8 text-center text-[12.5px] text-muted">
                Contract not found or unavailable from current providers.
              </div>
            )}
          </div>
        ) : null}
      </Panel>
      <EvmNetMarketsTable chain={chain} />
    </div>
  );
}

type EvmNetLookup = NonNullable<ReturnType<typeof useEvmNetDirectLookup>["data"]>;

export function EvmNetDirectCard({ chain, data }: { chain: EvmNetChain; data: EvmNetLookup }) {
  const t = data.token;
  const m = data.metadata;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <AssetLogo symbol={t?.symbol ?? m?.symbol} url={t?.logoUrl ?? null} size={36} />
        <div>
          <div className="text-[14px] font-semibold">{t?.name ?? m?.name ?? "—"}</div>
          <div className="text-[12px] text-muted">
            ${t?.symbol ?? m?.symbol ?? "—"} · {data.pairs} pair{data.pairs === 1 ? "" : "s"} ·{" "}
            {m?.isContract ? "contract" : "EOA / unknown"}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] md:grid-cols-4">
        <Kv label="Contract" value={m?.address ?? "—"} mono />
        <Kv label="Price" value={t?.priceUsd != null ? fmtUsd(t.priceUsd) : "—"} />
        <Kv label="Market Cap" value={t?.marketCap != null ? fmtUsd(t.marketCap) : "—"} />
        <Kv label="FDV" value={t?.fdv != null ? fmtUsd(t.fdv) : "—"} />
        <Kv label="Liquidity" value={t?.liquidity != null ? fmtUsd(t.liquidity) : "—"} />
        <Kv label="24H Volume" value={t?.volume24h != null ? fmtUsd(t.volume24h) : "—"} />
        <Kv label="24H" value={t?.change24hPct != null ? fmtPct(t.change24hPct) : "—"} tone={changeTone(t?.change24hPct ?? null)} />
        <Kv label="Txns 24H" value={t?.txns24h != null ? fmtNum(t.txns24h) : "—"} />
        <Kv label="DEX" value={t?.dexId ?? "—"} />
        <Kv label="Quote" value={t?.quoteToken ?? "—"} />
        <Kv label="Decimals" value={m?.decimals != null ? String(m.decimals) : "—"} />
      </dl>
      <div className="mt-3 text-[11px] text-faint">
        Source: {data.source}
        {data.pairs === 0 && m?.isContract
          ? " · Contract found, but no verified market data is currently available."
          : ""}
      </div>
      <a
        href={`${EXPLORERS[chain]}/address/${m?.address ?? ""}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-[11.5px] text-green/80 hover:underline"
      >
        View on explorer ↗
      </a>
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