"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useLiveMarkets } from "@/hooks/useSync";
import type { LiveMarketRow } from "@/services/recodeService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Sparkline } from "@/components/charts/Sparkline";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

const TYPE_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tokenized-stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "treasury", label: "Treasuries" },
  { id: "commodity", label: "Commodities" },
  { id: "fund", label: "Funds" },
  { id: "other", label: "Other RWAs" },
];

type SortKey = "mcap" | "volume" | "change" | "holders" | "name";

export function MarketsTable({
  title,
  sub,
  assetType,
  showFilters = true,
}: {
  title: string;
  sub?: string;
  assetType?: string;
  showFilters?: boolean;
}) {
  const markets = useLiveMarkets("24H");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q); // debounced search without extra state
  const [sort, setSort] = useState<SortKey>("mcap");

  const rows = useMemo(() => {
    let out: LiveMarketRow[] = markets.data ?? [];
    if (assetType) out = out.filter((m) => m.assetType === assetType);
    else if (type !== "all") out = out.filter((m) => m.assetType === type);
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
        case "volume": return (b.volume24h ?? 0) - (a.volume24h ?? 0);
        case "change": return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
        case "holders": return (b.holders ?? 0) - (a.holders ?? 0);
        case "name": return (a.symbol ?? "").localeCompare(b.symbol ?? "");
        default: return (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0);
      }
    });
    return sorted;
  }, [markets.data, type, dq, sort, assetType]);

  // Newest verified quote timestamp across the filtered rows (server quote time,
  // not client fetch time) — drives the honest "Updated Xs ago" label.
  const newestQuote = useMemo(() => {
    let max: number | null = null;
    for (const m of markets.data ?? []) {
      if (m.updatedAt != null && (max == null || m.updatedAt > max)) max = m.updatedAt;
    }
    return max;
  }, [markets.data]);

  const quoteLiveCount = useMemo(
    () => (markets.data ?? []).filter((m) => m.dataStatus === "live").length,
    [markets.data],
  );

  /* Auto-register a compact market snapshot with the RECODE Agent. */
  const agentSnapshot = useMemo(() => {
    if (rows.length === 0) return null;
    const pick = (r: LiveMarketRow) => ({
      symbol: r.symbol,
      name: r.name,
      price: r.price,
      change24hPct: r.change24hPct,
      volume24h: r.volume24h,
      marketCap: r.marketCap,
      liquidity: r.liquidity,
      holders: r.holders,
      bid: r.bid,
      ask: r.ask,
      spreadPct: r.spreadPct,
      tradingStatus: r.tradingStatus,
    });
    const byChange = [...rows]
      .filter((r) => r.change24hPct != null)
      .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0));
    return {
      visibleRows: rows.length,
      quoteFreshness: markets.status,
      topGainers: byChange.slice(0, 5).map(pick),
      topLosers: byChange.slice(-5).map(pick),
      sortedBy: sort,
    };
  }, [rows, markets.status, sort]);
  useAgentPageContext(
    agentSnapshot ? { markets: agentSnapshot } : null,
    sort !== "mcap" ? `sorted by ${sort}` : undefined,
  );

  const th = (key: SortKey, label: string, align: string, hide?: string) => (
    <th className={`px-3 pb-2 font-semibold ${align} ${hide ?? ""}`}>
      <button
        type="button"
        onClick={() => setSort(key)}
        className={`uppercase tracking-[0.12em] hover:text-muted ${sort === key ? "text-green" : ""}`}
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PanelHeader title={title} sub={sub} />
      {/* LIVE / CONNECTING / SYNCING / STALE / ERROR + honest quote age */}
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <LiveStatusBadge status={markets.status} />
        <UpdatedAgo ts={newestQuote} prefix="Last quote" />
        <span className="text-[10.5px] text-faint">
          auto-refresh 15s · RHJ quotes cached ~15s · no page reload needed
        </span>
        {quoteLiveCount > 0 && markets.status === "live" ? (
          <span className="tnum text-[10.5px] text-faint">{quoteLiveCount} live quotes</span>
        ) : null}
      </div>
      <Panel padded={false}>
        {showFilters ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
            {TYPE_FILTERS.map((f) => (
              <Chip key={f.id} active={type === f.id} onClick={() => setType(f.id)}>
                {f.label}
              </Chip>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by symbol, name or contract…"
              className="ml-auto h-8 w-full max-w-64 rounded-[4px] border border-line bg-panel-2 px-2.5 text-[12px] outline-none placeholder:text-faint focus:border-green/40"
            />
          </div>
        ) : null}
        <StateBlock status={markets.status} loadingRows={10}>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-faint">
              No verified assets match. RECODE never lists unverified tokens.
            </p>
          ) : (
            <MarketRows rows={rows} th={th} />
          )}
        </StateBlock>
        <div className="px-4 py-2.5 text-[10.5px] text-faint">
          {rows.length} verified assets · prices from the Robinhood Chain explorer & official
          stock-token API · holders from on-chain indexing
        </div>
      </Panel>
    </div>
  );
}

type ThFn = (key: SortKey, label: string, align: string, hide?: string) => React.ReactNode;

/** Hover transparency for the price cell — every figure is traceable. */
function quoteTooltip(m: LiveMarketRow): string {
  const parts: string[] = [];
  if (m.bid != null && m.ask != null) parts.push(`Bid ${m.bid.toFixed(2)} / Ask ${m.ask.toFixed(2)}`);
  if (m.spreadPct != null) parts.push(`spread ${m.spreadPct.toFixed(2)}%`);
  if (m.tradingStatus) parts.push(m.tradingStatus);
  if (m.dataSources?.price) parts.push(`source: ${m.dataSources.price}`);
  if (m.updatedAt != null) parts.push(`updated ${timeAgo(m.updatedAt)}`);
  return parts.join(" · ") || "No verified quote yet";
}

function MarketRows({ rows, th }: { rows: LiveMarketRow[]; th: ThFn }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
            {th("name", "Asset", "text-left")}
            {th("mcap", "Market Cap", "text-right")}
            <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">Price</th>
            {th("change", "24H", "text-right")}
            {th("volume", "Volume 24H", "text-right")}
            {th("holders", "Holders", "text-right hidden md:table-cell")}
            <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">
              Underlying MCap
            </th>
            <th className="hidden px-4 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.address} className="row-hover border-b border-line-soft">
              <td className="px-4 py-2.5">
                <Link
                  href={`/app/asset/${encodeURIComponent((m.symbol ?? m.address).toUpperCase())}`}
                  className="flex items-center gap-2.5"
                >
                  <AssetLogo symbol={m.symbol} url={m.logoUrl} size={22} />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium">
                      {m.symbol ?? shortHash(m.address)}
                      {m.verified ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Verified registry" />
                      ) : null}
                      {m.dataStatus === "live" ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-pos" title="Live quote" />
                      ) : m.dataStatus === "stale" ? (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-warn"
                          title="Stale — quote older than the freshness window"
                        />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-line" title="No verified quote yet" />
                      )}
                    </span>
                    <span className="block max-w-52 truncate text-[10.5px] text-faint">
                      {m.name ?? "Tokenized asset"}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m.marketCap ?? m.fdv)}</td>
              <td className="tnum px-3 py-2.5 text-right" title={quoteTooltip(m)}>
                {m.price != null ? fmtUsd(m.price) : "—"}
              </td>
              <td className={`tnum px-3 py-2.5 text-right ${changeTone(m.change24hPct)}`}>
                {fmtPct(m.change24hPct)}
              </td>
              <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m.volume24h)}</td>
              <td className="tnum hidden px-3 py-2.5 text-right md:table-cell">
                {m.holders != null ? fmtNum(m.holders) : "—"}
              </td>
              <td className="tnum hidden px-3 py-2.5 text-right lg:table-cell">
                {m.underlyingMarketCap != null ? (
                  fmtUsd(m.underlyingMarketCap)
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                {m.sparkline?.length > 1 ? (
                  <Sparkline points={m.sparkline} width={72} height={22} />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}