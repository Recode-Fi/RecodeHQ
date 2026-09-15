"use client";

import Link from "next/link";
import { useLiveMarkets, useLiveOverview, useEngineStatus, useSyncPolling } from "@/hooks/useSync";
import type { LiveTx } from "@/services/recodeService";
import type { LiveMarketRow } from "@/services/recodeService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Sparkline } from "@/components/charts/Sparkline";
import { StatStrip, type StatDef, StateBlock, PanelHeader } from "@/components/kit/Kit";
import { Panel, Tag } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, shortHash, timeAgo, fmtNum } from "@/lib/format";

export function DashboardView() {
  const overview = useLiveOverview();
  const markets = useLiveMarkets("24H");
  useEngineStatus();
  const txs = useSyncPolling<LiveTx[]>("/api/sync/transactions", 8_000);

  const o = overview.data;
  const rows = markets.data ?? [];

  const stats: StatDef[] = [
    {
      label: "Total RWA Market Cap",
      value: o?.totalMarketCap != null ? fmtUsd(o.totalMarketCap) : "Data unavailable",
      sub: "Verified token market caps",
      status: overview.status,
    },
    {
      label: "24H Volume",
      value: o?.totalVolume24h != null ? fmtUsd(o.totalVolume24h) : "Data unavailable",
      sub: "Sum of verified per-token volume",
      status: overview.status,
    },
    {
      label: "Active Wallets",
      value: o?.activeWallets != null ? fmtNum(o.activeWallets) : "Data unavailable",
      sub: "Active in last 24h (indexer)",
      status: overview.status,
    },
    {
      label: "Tokenized Assets",
      value: o ? `${o.marketsWithPrice}/${o.marketsIndexed}` : "—",
      sub: "With price / discovered",
      status: overview.status,
    },
    {
      label: "Whale Activity",
      value:
        o?.whaleTransactionsToday != null
          ? `${fmtNum(o.whaleTransactionsToday)} today`
          : "Data unavailable",
      sub: "Flows ≥ $10,000 on-chain",
      status: overview.status,
    },
  ];

  const movers = [...rows].filter((r) => r.change24hPct != null);
  const gainers = [...movers].sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0)).slice(0, 5);
  const losers = [...movers].sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0)).slice(0, 5);
  const biggest = [...rows]
    .sort((a, b) => (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-green/80">
          <span className="live-dot" /> RECODE INTELLIGENCE
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Tokenized markets, decoded.</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Real-time intelligence across wallets, assets, liquidity and on-chain activity. See the
          signal. Decode the market.
        </p>
      </header>

      <StatStrip stats={stats} />

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" padded={false}>
          <div className="p-4 pb-0">
            <PanelHeader
              title="Largest tokenized assets"
              sub="By verified on-chain market cap"
              right={
                <Link href="/app/markets" className="text-[11px] text-green hover:underline">
                  All markets →
                </Link>
              }
            />
          </div>
          <StateBlock status={markets.status} loadingRows={6}>
            <BigTable rows={biggest} />
          </StateBlock>
        </Panel>

        <Panel padded={false}>
          <div className="p-4 pb-0">
            <PanelHeader
              title="On-chain activity"
              sub="Verified token transfers"
              right={
                <Link href="/app/explorer" className="text-[11px] text-green hover:underline">
                  Explorer →
                </Link>
              }
            />
          </div>
          <StateBlock status={txs.status} loadingRows={8}>
            <ul className="max-h-[420px] overflow-y-auto">
              {(txs.data ?? []).slice(0, 20).map((t) => (
                <li key={t.id ?? `${t.hash}-${t.ts}-${t.action}-${t.wallet}-${t.amount ?? 0}`} className="row-hover flex items-center gap-3 border-b border-line-soft px-4 py-2.5">
                  <Tag tone={t.action === "buy" ? "pos" : t.action === "sell" ? "neg" : "neutral"}>
                    {t.action}
                  </Tag>
                  <span className="min-w-0 flex-1">
                    <span className="tnum block truncate text-[12px]">
                      {t.symbol ?? "—"} · {t.amount != null ? fmtNum(t.amount) : "—"}
                      {t.usd != null ? ` (${fmtUsd(t.usd)})` : ""}
                    </span>
                    <span className="tnum block text-[10px] text-faint">
                      {t.wallet ? shortHash(t.wallet) : "unknown wallet"} · {timeAgo(t.ts)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </StateBlock>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Top gainers · 24H" sub="Verified price change" />
          <MoverList rows={gainers} />
        </Panel>
        <Panel>
          <PanelHeader title="Top decliners · 24H" sub="Verified price change" />
          <MoverList rows={losers} />
        </Panel>
      </div>
    </div>
  );
}

function BigTable({ rows }: { rows: LiveMarketRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 pb-6 text-[12px] text-faint">
        Awaiting verified market data — the sync engine is still discovering markets.
      </p>
    );
  }
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
          <th className="px-4 pb-2 font-semibold">Asset</th>
          <th className="px-3 pb-2 text-right font-semibold">Price</th>
          <th className="px-3 pb-2 text-right font-semibold">24H</th>
          <th className="px-3 pb-2 text-right font-semibold">Market Cap</th>
          <th className="hidden px-3 pb-2 text-right font-semibold sm:table-cell">Volume 24H</th>
          <th className="hidden px-4 pb-2 text-right font-semibold md:table-cell">Trend</th>
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
                  <span className="block font-medium">{m.symbol ?? shortHash(m.address)}</span>
                  <span className="block text-[10.5px] text-faint">{m.name ?? "Tokenized asset"}</span>
                </span>
              </Link>
            </td>
            <td className="tnum px-3 py-2.5 text-right">{m.price != null ? fmtUsd(m.price) : "—"}</td>
            <td className={`tnum px-3 py-2.5 text-right ${changeTone(m.change24hPct)}`}>
              {fmtPct(m.change24hPct)}
            </td>
            <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m.marketCap ?? m.fdv)}</td>
            <td className="tnum hidden px-3 py-2.5 text-right sm:table-cell">{fmtUsd(m.volume24h)}</td>
            <td className="hidden px-4 py-2.5 text-right md:table-cell">
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
  );
}

function MoverList({ rows }: { rows: LiveMarketRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-faint">Awaiting verified price data…</p>;
  }
  return (
    <ul className="space-y-1">
      {rows.map((m) => (
        <li key={m.address}>
          <Link
            href={`/app/asset/${encodeURIComponent((m.symbol ?? m.address).toUpperCase())}`}
            className="row-hover flex items-center gap-3 rounded-[4px] px-2 py-2"
          >
            <AssetLogo symbol={m.symbol} url={m.logoUrl} size={20} />
            <span className="tnum w-16 font-medium">{m.symbol}</span>
            <span className="tnum flex-1 text-right text-muted">{fmtUsd(m.price)}</span>
            <span className={`tnum w-20 text-right ${changeTone(m.change24hPct)}`}>
              {fmtPct(m.change24hPct)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

