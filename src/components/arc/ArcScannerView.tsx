"use client";

import { useState } from "react";
import { useArcDirectLookup } from "@/hooks/useArc";
import { ArcMarketsTable } from "./ArcMarketsTable";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum } from "@/lib/format";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ARC SCANNER — market table + direct contract lookup.
 * A valid 0x… contract always triggers a LIVE lookup (DexScreener
 * "arc" pairs + Arc RPC eth_call), never just the indexed dataset.
 */

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

export function ArcScannerView({ initial }: { initial?: string }) {
  const [input, setInput] = useState(initial ?? "");
  const [lookup, setLookup] = useState<string | null>(
    initial && EVM_RE.test(initial) ? initial : null,
  );
  const direct = useArcDirectLookup(lookup);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (EVM_RE.test(v)) setLookup(v.toLowerCase());
    else setLookup(v && !EVM_RE.test(v) && v.length > 0 ? v : null);
  };

  const invalid = lookup != null && !EVM_RE.test(lookup);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="ARC CONTRACT SCANNER
            "
          right={
            <span className="text-[11px] text-faint">
              Arc mainnet · chain 5042 · USDC gas
            </span>
          }
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
          <div className="px-4 pb-4 text-[12.5px] text-warn">Invalid Arc contract address</div>
        ) : null}
        {lookup && EVM_RE.test(lookup) ? (
          <div className="px-4 pb-4">
            {direct.status === "loading" ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted">Resolving Arc contract…</div>
            ) : direct.data ? (
              <ArcDirectCard data={direct.data} />
            ) : (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted">Contract not found or unavailable from current providers.</div>
            )}
          </div>
        ) : null}
      </Panel>
      <ArcMarketsTable />
    </div>
  );
}

type ArcTokenIntel = NonNullable<ReturnType<typeof useArcDirectLookup>["data"]>;

function ArcDirectCard({ data }: { data: ArcTokenIntel }) {
  const t = data.token;
  const m = data.metadata;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <AssetLogo symbol={t?.symbol ?? m?.symbol} url={t?.logoUrl ?? null} size={36} />
        <div>
          <div className="text-[14px] font-semibold">
            {t?.name ?? m?.name ?? "—"}
          </div>
          <div className="text-[12px] text-muted">
            ${t?.symbol ?? m?.symbol ?? "—"} · {data.pairs} pair{data.pairs === 1 ? "" : "s"} ·{" "}
            {m?.isContract ? "contract" : "EOA / unknown"}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] md:grid-cols-4">
        <Row label="Contract" value={m?.address ?? "—"} mono />
        <Row label="Price" value={t?.priceUsd != null ? fmtUsd(t.priceUsd) : "—"} />
        <Row label="Market Cap" value={t?.marketCap != null ? fmtUsd(t.marketCap) : "—"} />
        <Row label="FDV" value={t?.fdv != null ? fmtUsd(t.fdv) : "—"} />
        <Row label="Liquidity" value={t?.liquidity != null ? fmtUsd(t.liquidity) : "—"} />
        <Row label="24H Volume" value={t?.volume24h != null ? fmtUsd(t.volume24h) : "—"} />
        <Row
          label="24H"
          value={t?.change24hPct != null ? fmtPct(t.change24hPct) : "—"}
          tone={changeTone(t?.change24hPct ?? null)}
        />
        <Row label="Txns 24H" value={t?.txns24h != null ? fmtNum(t.txns24h) : "—"} />
        <Row label="DEX" value={t?.dexId ?? "—"} />
        <Row label="Quote" value={t?.quoteToken ?? "—"} />
        <Row label="Decimals" value={m?.decimals != null ? String(m.decimals) : "—"} />
        <Row label="Whale events" value={String(data.whales)} />
      </dl>
      <div className="mt-3 text-[11px] text-faint">
        Source: {data.source}
        {data.pairs === 0 && m?.isContract
          ? " · Contract found, but no verified market data is currently available."
          : ""}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className={`${mono ? "font-mono text-[11.5px]" : ""} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

