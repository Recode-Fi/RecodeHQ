"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useSolanaScanner } from "@/hooks/useSolana";
import type { SolanaScanRow } from "@/services/solanaService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Sparkline } from "@/components/charts/Sparkline";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { SOLANA_ADDRESS_RE } from "@/lib/types";
import solanaSvg from "@web3icons/core/svgs/tokens/branded/SOL.svg";

/**
 * ============================================================
 * SOLANA MARKET SCANNER — live, per-token intelligence over the
 * verified Solana store: price, market cap, FDV, liquidity Δ,
 * volume Δ, 24h change, buy/sell counts + CALCULATED ratio, pair
 * age, DEX/pair, whale and smart-money activity. Sorts operate on
 * real data only; unavailable fields render "—", never 0.
 * ============================================================
 */

const SORTS = [
  { id: "volume", label: "VOLUME" },
  { id: "liquidity", label: "LIQUIDITY" },
  { id: "gainers", label: "GAINERS" },
  { id: "losers", label: "LOSERS" },
  { id: "activity", label: "ACTIVITY" },
  { id: "new", label: "NEW PAIRS" },
  { id: "whales", label: "WHALE ACTIVITY" },
  { id: "smart", label: "SMART MONEY" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

function sortRows(rows: SolanaScanRow[], sort: SortId): SolanaScanRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "volume":
      return sorted.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    case "liquidity":
      return sorted.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
    case "gainers":
      return sorted.sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity));
    case "losers":
      return sorted.sort((a, b) => (a.change24hPct ?? Infinity) - (b.change24hPct ?? Infinity));
    case "activity":
      return sorted.sort((a, b) => (b.txns24h ?? 0) - (a.txns24h ?? 0));
    case "new":
      return sorted.sort((a, b) => (b.pairAgeMs ?? Infinity) - (a.pairAgeMs ?? Infinity));
    case "whales":
      return sorted.sort((a, b) => b.whaleEvents24h - a.whaleEvents24h);
    case "smart":
      return sorted.sort((a, b) => b.smartWallets24h - a.smartWallets24h);
  }
}

export function SolanaScannerView({ initialMint }: { initialMint?: string }) {
  const scanner = useSolanaScanner();
  const [sort, setSort] = useState<SortId>("volume");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);

  const rows = useMemo(() => {
    let out = scanner.data ?? [];
    const s = dq.trim().toLowerCase();
    if (s && !SOLANA_ADDRESS_RE.test(s.trim())) {
      out = out.filter(
        (r) =>
          (r.symbol ?? "").toLowerCase().includes(s) || (r.name ?? "").toLowerCase().includes(s),
      );
    }
    if (sort === "gainers") out = out.filter((r) => (r.change24hPct ?? 0) > 0);
    if (sort === "losers") out = out.filter((r) => (r.change24hPct ?? 0) < 0);
    if (sort === "new") out = out.filter((r) => r.pairAgeMs != null && r.pairAgeMs <= 7 * 86_400_000);
    if (sort === "whales") out = out.filter((r) => r.whaleEvents24h > 0);
    if (sort === "smart") out = out.filter((r) => r.smartWallets24h > 0);
    return sortRows(out, sort);
  }, [scanner.data, dq, sort]);

  const newestQuote = useMemo(() => {
    let max: number | null = null;
    for (const r of scanner.data ?? []) {
      if (r.updatedAt != null && (max == null || r.updatedAt > max)) max = r.updatedAt;
    }
    return max;
  }, [scanner.data]);

  const liveCount = useMemo(
    () => (scanner.data ?? []).filter((r) => r.dataStatus === "live").length,
    [scanner.data],
  );

  useAgentPageContext(
    {
      markets: {
        network: "Solana (mainnet-beta) · Market Scanner",
        rowsShown: rows.length,
        liveQuotes: liveCount,
        activeSort: sort,
        top: rows.slice(0, 12).map((r) => ({
          symbol: r.symbol,
          mint: r.mint,
          price: r.price,
          change24hPct: r.change24hPct,
          volume24h: r.volume24h,
          liquidity: r.liquidity,
          buySellRatio: r.buySellRatio,
          whaleEvents24h: r.whaleEvents24h,
          smartWallets24h: r.smartWallets24h,
          dexId: r.dexId,
        })),
        dataStatus: scanner.status,
      },
    },
    `solana scanner · sort: ${sort}`,
  );

  const badgeStatus =
    scanner.status === "live"
      ? ("live" as const)
      : scanner.status === "stale"
        ? ("stale" as const)
        : scanner.status === "unavailable"
          ? ("unavailable" as const)
          : ("syncing" as const);

  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="[&_svg]:h-[22px] [&_svg]:w-[22px]"
            dangerouslySetInnerHTML={{ __html: solanaSvg }}
          />
          <div>
            <h1 className="text-xl font-semibold">Solana Market Scanner</h1>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted">
              Live per-token scan across tracked Solana pairs — buy/sell flow, liquidity and
              volume deltas, pair age and whale/smart-money activity. Calculated from verified
              data only; unavailable metrics show &quot;—&quot;.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusBadge status={badgeStatus} label={scanner.status === "live" ? "LIVE" : undefined} />
          <UpdatedAgo ts={newestQuote} />
        </div>
      </header>

      <Panel>
        <PanelHeader
          title="Scanner"
          sub={`${rows.length} tokens · ${liveCount} live quotes`}
          right={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {SORTS.map((s) => (
                <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          }
        />
        <div className="mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by symbol or name… (paste a mint address to open its full scan)"
            className="tnum w-full rounded-[4px] border border-line bg-panel px-3 py-2 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-line-strong"
          />
        </div>

        <StateBlock
          status={badgeStatus === "unavailable" ? "unavailable" : badgeStatus === "syncing" ? "syncing" : "live"}
          loadingRows={8}
          empty={
            <p className="py-10 text-center text-[12.5px] text-faint">
              No tracked Solana tokens match this filter — the scanner only renders verified data.
            </p>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[9.5px] text-muted">
                  <th className="px-4 pb-2 text-left font-semibold uppercase tracking-[0.12em]">Token</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">Price</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">MCap</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">FDV</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">24H</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">Vol 24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Liq</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Liq Δ24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Vol Δ24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] md:table-cell">Buys/Sells</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] md:table-cell">Ratio</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Pair Age</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">DEX</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Whales</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Smart</th>
                  <th className="hidden px-4 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mint} className="row-hover border-b border-line-soft">
                    <td className="px-4 py-2.5">
                      <Link href={`/app/token/${encodeURIComponent(r.mint)}`} className="flex items-center gap-2.5">
                        <AssetLogo symbol={r.symbol} url={r.logoUrl} size={22} />
                        <span>
                          <span className="flex items-center gap-1.5 font-medium">
                            {r.symbol ?? shortHash(r.mint)}
                            {r.dataStatus === "live" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-pos" title="Live quote" />
                            ) : r.dataStatus === "stale" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Stale quote" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-line" title="No verified quote yet" />
                            )}
                          </span>
                          <span className="block max-w-44 truncate text-[10.5px] text-faint">
                            {r.name ?? shortHash(r.mint, 4, 4)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.price)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{r.marketCap != null ? fmtUsd(r.marketCap) : "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right">{r.fdv != null ? fmtUsd(r.fdv) : "—"}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${changeTone(r.change24hPct)}`}>{fmtPct(r.change24hPct)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.volume24h)}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right lg:table-cell">
                      {r.liquidity != null ? fmtUsd(r.liquidity) : "—"}
                    </td>
                    <td className={`tnum hidden px-3 py-2.5 text-right lg:table-cell ${changeTone(r.liquidityChange24hPct)}`}>
                      {r.liquidityChange24hPct != null ? fmtPct(r.liquidityChange24hPct) : "—"}
                    </td>
                    <td className={`tnum hidden px-3 py-2.5 text-right lg:table-cell ${changeTone(r.volumeChange24hPct)}`}>
                      {r.volumeChange24hPct != null ? fmtPct(r.volumeChange24hPct) : "—"}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right md:table-cell" title="24h buys / sells (DEX pairs)">
                      {r.buys24h != null && r.sells24h != null ? `${fmtNum(r.buys24h)} / ${fmtNum(r.sells24h)}` : "—"}
                    </td>
                    <td
                      className="tnum hidden px-3 py-2.5 text-right md:table-cell"
                      title="Calculated: 24h buys ÷ sells (unavailable when sells is 0 or counts are unknown)"
                    >
                      {r.buySellRatio != null ? r.buySellRatio.toFixed(2) : "—"}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell">
                      {r.pairAgeMs != null ? timeAgo(Date.now() - r.pairAgeMs) : "—"}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right xl:table-cell">
                      <span className="text-muted">{r.dexId ?? "—"}</span>
                      {r.pairAddress ? (
                        <span className="block text-[10px] text-faint">{shortHash(r.pairAddress, 4, 4)}</span>
                      ) : null}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell" title="Verified whale events (24h)">
                      {r.whaleEvents24h > 0 ? <span className="text-warn">{r.whaleEvents24h}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell" title="Wallets with verified accumulation ≥ threshold (24h)">
                      {r.smartWallets24h > 0 ? <span className="text-pos">{r.smartWallets24h}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                      {r.sparkline?.length > 1 ? <Sparkline points={r.sparkline} width={72} height={22} /> : <span className="text-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateBlock>
      </Panel>
      <p className="text-[10.5px] text-faint">
        Buy/sell ratio is calculated from verified 24h pair transactions; liquidity/volume deltas
        compare the current quote with the engine&apos;s own stored observation ≥ 24h old (null
        until history exists). Whale and smart-money counts come from verified largest-account
        balance deltas on Solana RPC — never modeled, never substituted.
      </p>
    </div>
  );
}