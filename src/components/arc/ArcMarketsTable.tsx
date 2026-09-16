"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useArcMarkets } from "@/hooks/useArc";
import type { ArcMarketRow } from "@/services/arcService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" || s === "syncing" || s === "connecting"
    ? (s as DataStatus)
    : "syncing";
}
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ARC MARKETS — live DEX market data for Arc (chain 5042) tokens.
 * Fields a provider does not expose render "—"/"Data unavailable" — never 0.
 */

const SORTS = [
  { id: "volume", label: "VOLUME" },
  { id: "liquidity", label: "LIQUIDITY" },
  { id: "mcap", label: "MARKET CAP" },
  { id: "change", label: "GAINERS" },
  { id: "txns", label: "ACTIVITY" },
  { id: "new", label: "NEW PAIRS" },
] as const;

type SortKey = (typeof SORTS)[number]["id"];

export function ArcMarketsTable() {
  const markets = useArcMarkets();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [sort, setSort] = useState<SortKey>("volume");

  const rows = useMemo(() => {
    let out: ArcMarketRow[] = markets.data ?? [];
    if (sort === "new") out = out.filter((m) => m.isNew);
    if (dq.trim()) {
      const s = dq.trim().toLowerCase();
      out = out.filter(
        (m) =>
          (m.symbol ?? "").toLowerCase().includes(s) ||
          (m.name ?? "").toLowerCase().includes(s) ||
          m.address.toLowerCase().includes(s),
      );
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "mcap":
          return (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0);
        case "change":
          return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
        case "liquidity":
          return (b.liquidity ?? 0) - (a.liquidity ?? 0);
        case "txns":
          return (b.txns24h ?? 0) - (a.txns24h ?? 0);
        default:
          return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      }
    });
    return sorted;
  }, [markets.data, dq, sort]);

  useAgentPageContext(
    {
      markets: {
        network: "Arc (chain 5042)",
        rowCount: rows.length,
        rows: rows.slice(0, 10).map((r) => ({
          symbol: r.symbol,
          address: r.address,
          priceUsd: r.priceUsd,
          liquidity: r.liquidity,
          volume24h: r.volume24h,
          change24hPct: r.change24hPct,
          dex: r.dexId,
        })),
        dataStatus: markets.status,
      },
    },
    "arc markets",
  );

  return (
    <Panel>
      <PanelHeader
        title="ARC MARKETS
          "
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={toDataStatus(markets.status)} />
            <UpdatedAgo ts={rows[0]?.updatedAt ?? null} />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol, name or contract…"
          className="w-64 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-green/60"
        />
        {SORTS.map((s) => (
          <button key={s.id} onClick={() => setSort(s.id)}>
            <Chip active={sort === s.id}>{s.label}</Chip>
          </button>
        ))}
      </div>
      <ArcMarketsBody rows={rows} status={toDataStatus(markets.status)} />
    </Panel>
  );
}

function ArcMarketsBody({ rows, status }: { rows: ArcMarketRow[]; status: string }) {
  if (status === "loading" || status === "idle") {
    return <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading Arc markets…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12.5px] text-muted">{
          status === "unavailable"
            ? "Arc market data unavailable"
            : "No tracked Arc tokens yet — the engine is discovering USDC-quoted pairs."
        }</div>
    );
  }
  return <ArcMarketsRows rows={rows} />;
}

function ArcMarketsRows({ rows }: { rows: ArcMarketRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="px-4 py-2 font-medium">Token</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">24H</th>
            <th className="px-3 py-2 font-medium">Liquidity</th>
            <th className="px-3 py-2 font-medium">24H Volume</th>
            <th className="px-3 py-2 font-medium">Mkt Cap</th>
            <th className="px-3 py-2 font-medium">Txns</th>
            <th className="px-3 py-2 font-medium">DEX</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((m) => (
            <tr key={m.address} className="border-t border-line/60 hover:bg-surface/60">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <AssetLogo symbol={m.symbol} url={m.logoUrl} size={22} />
                  <div>
                    <div className="font-medium">{m.symbol ?? shortHash(m.address)}</div>
                    <div className="text-[11px] text-faint">{m.name ?? "—"}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">{m.priceUsd != null ? fmtUsd(m.priceUsd) : "—"}</td>
              <td className={`px-3 py-2.5 ${changeTone(m.change24hPct)}`}>
                {m.change24hPct != null ? fmtPct(m.change24hPct) : "—"}
              </td>
              <td className="px-3 py-2.5">{m.liquidity != null ? fmtUsd(m.liquidity) : "—"}</td>
              <td className="px-3 py-2.5">{m.volume24h != null ? fmtUsd(m.volume24h) : "—"}</td>
              <td className="px-3 py-2.5">
                {m.marketCap != null ? fmtUsd(m.marketCap) : m.fdv != null ? fmtUsd(m.fdv) : "—"}
              </td>
              <td className="px-3 py-2.5">
                {m.txns24h != null ? fmtNum(m.txns24h) : "—"}
                {m.buys24h != null && m.sells24h != null ? (
                  <span className="ml-1.5 text-[11px] text-faint">
                    {fmtNum(m.buys24h)}/{fmtNum(m.sells24h)}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-muted">
                {m.dexId ? <span className="uppercase">{m.dexId}</span> : "—"}
                {m.pairAddress ? (
                  <a
                    href={`https://explorer.arc.io/address/${m.pairAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1.5 text-[11px] text-green/80 hover:underline"
                  >
                    pair
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
