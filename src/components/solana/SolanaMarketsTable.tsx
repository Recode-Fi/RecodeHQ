"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useSolanaMarkets } from "@/hooks/useSolana";
import type { LiveSolanaRow } from "@/services/solanaService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Sparkline } from "@/components/charts/Sparkline";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ============================================================
 * SOLANA MARKET SCREENER — live DEX market data for Solana mints.
 * Every row is a real tracked token: price, market cap, liquidity,
 * 24h volume, 24h change, buy/sell activity and DEX/pair info from
 * the Solana intelligence layer. Fields a provider does not expose
 * render "—"/"Data unavailable" — never 0.
 * ============================================================
 */

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "verified", label: "Tracked pairs" },
  { id: "new", label: "New (24H)" },
] as const;

type SortKey = "mcap" | "volume" | "change" | "liquidity" | "txns" | "name";

export function SolanaMarketsTable() {
  const markets = useSolanaMarkets();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [sort, setSort] = useState<SortKey>("volume");

  const rows = useMemo(() => {
    let out: LiveSolanaRow[] = markets.data ?? [];
    if (filter === "verified") out = out.filter((m) => m.pairAddress != null);
    if (filter === "new") out = out.filter((m) => m.isNew);
    if (dq.trim()) {
      const s = dq.trim().toLowerCase();
      out = out.filter(
        (m) =>
          (m.symbol ?? "").toLowerCase().includes(s) ||
          (m.name ?? "").toLowerCase().includes(s) ||
          m.mint.toLowerCase().includes(s),
      );
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "mcap": return (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0);
        case "change": return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
        case "liquidity": return (b.liquidity ?? 0) - (a.liquidity ?? 0);
        case "txns": return (b.txns24h ?? 0) - (a.txns24h ?? 0);
        case "name": return (a.symbol ?? "").localeCompare(b.symbol ?? "");
        default: return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      }
    });
    return sorted;
  }, [markets.data, filter, dq, sort]);

  const newestQuote = useMemo(() => {
    let max: number | null = null;
    for (const m of markets.data ?? []) {
      if (m.updatedAt != null && (max == null || m.updatedAt > max)) max = m.updatedAt;
    }
    return max;
  }, [markets.data]);

  const liveCount = useMemo(
    () => (markets.data ?? []).filter((m) => m.dataStatus === "live").length,
    [markets.data],
  );

  /* Auto-register a Solana market snapshot with the RECODE Agent. */
  useAgentPageContext(
    {
      markets: {
        network: "Solana (mainnet-beta)",
        rowsShown: rows.length,
        liveQuotes: liveCount,
        top: rows.slice(0, 12).map((r) => ({
          symbol: r.symbol,
          name: r.name,
          mint: r.mint,
          price: r.price,
          change24hPct: r.change24hPct,
          volume24h: r.volume24h,
          liquidity: r.liquidity,
          dexId: r.dexId,
          dataStatus: r.dataStatus,
        })),
        dataStatus: markets.status,
      },
    },
    "solana market snapshot",
  );

  const th = (key: SortKey, label: string, cls = "") => (
    <th
      className={`cursor-pointer select-none px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] transition-colors hover:text-text ${cls}`}
      onClick={() => setSort(key)}
    >
      {label}
      {sort === key ? <span className="ml-1 text-green">▾</span> : null}
    </th>
  );

  const badgeStatus =
    markets.status === "live"
      ? ("live" as const)
      : markets.status === "stale"
        ? ("stale" as const)
        : markets.status === "unavailable"
          ? ("unavailable" as const)
          : ("syncing" as const);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <NetworkIcon id="solana" size={22} />
          <div>
            <h1 className="text-xl font-semibold">Solana Markets</h1>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted">
              Live DEX market data for tracked Solana tokens — price, market cap, liquidity, 24h
              volume, trading activity and pair information. Verified provider data only.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusBadge status={badgeStatus} label={markets.status === "live" ? "LIVE" : undefined} />
          <UpdatedAgo ts={newestQuote} />
        </div>
      </header>

      <Panel>
        <PanelHeader
          title="Screener"
          sub={`${rows.length} tracked tokens · ${liveCount} live quotes`}
          right={
            <div className="flex items-center gap-1.5">
              {TYPE_FILTERS.map((f) => (
                <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          }
        />
        <div className="mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol, name or mint address…"
            className="tnum w-full rounded-[4px] border border-line bg-panel px-3 py-2 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-line-strong"
          />
        </div>

        <StateBlock
          status={badgeStatus === "unavailable" ? "unavailable" : badgeStatus === "syncing" ? "syncing" : "live"}
          loadingRows={8}
          empty={
            rows.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-faint">
                No tracked Solana tokens match — the engine indexes the active token universe and
                never fabricates rows.
              </p>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[9.5px] text-muted">
                  <th className="px-4 pb-2 text-left font-semibold uppercase tracking-[0.12em]">
                    Token
                  </th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">
                    Market Cap
                  </th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">
                    Price
                  </th>
                  {th("change", "24H")}
                  {th("volume", "Vol 24H")}
                  {th("liquidity", "Liquidity", "hidden md:table-cell")}
                  {th("txns", "Txns 24H", "hidden md:table-cell")}
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">
                    DEX / Pair
                  </th>
                  <th className="hidden px-4 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.mint} className="row-hover border-b border-line-soft">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/app/token/${encodeURIComponent(m.mint)}`}
                        className="flex items-center gap-2.5"
                      >
                        <AssetLogo symbol={m.symbol} url={m.logoUrl} size={22} />
                        <span>
                          <span className="flex items-center gap-1.5 font-medium">
                            {m.symbol ?? shortHash(m.mint)}
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
                            {m.isNew ? (
                              <span className="rounded-[3px] border border-green/40 px-1 text-[8.5px] font-semibold uppercase text-green">
                                new
                              </span>
                            ) : null}
                          </span>
                          <span className="block max-w-52 truncate text-[10.5px] text-faint">
                            {m.name ?? "Solana token"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">
                      {m.marketCap != null || m.fdv != null ? fmtUsd(m.marketCap ?? m.fdv) : "—"}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m.price)}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${changeTone(m.change24hPct)}`}>
                      {fmtPct(m.change24hPct)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m.volume24h)}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right md:table-cell">
                      {m.liquidity != null ? fmtUsd(m.liquidity) : "—"}
                    </td>
                    <td
                      className="tnum hidden px-3 py-2.5 text-right md:table-cell"
                      title={
                        m.buys24h != null && m.sells24h != null
                          ? `${m.buys24h} buys / ${m.sells24h} sells (24h)`
                          : undefined
                      }
                    >
                      {m.txns24h != null ? fmtNum(m.txns24h) : "—"}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right lg:table-cell">
                      {m.dexId ? (
                        <span className="text-muted">{m.dexId}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                      {m.pairCreatedAt != null ? (
                        <span className="block text-[10px] text-faint">
                          pair {timeAgo(m.pairCreatedAt)}
                        </span>
                      ) : null}
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
        </StateBlock>
      </Panel>
      <p className="text-[10.5px] text-faint">
        Solana data comes from live DEX market-data providers and Solana JSON-RPC (mainnet-beta).
        A missing field stays "—" — RECODE never displays 0 for unavailable data.
      </p>
    </div>
  );
}