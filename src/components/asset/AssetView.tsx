"use client";

import { useMemo, useState } from "react";
import { useLiveMarkets, useSyncPolling } from "@/hooks/useSync";
import type { LiveCandle, LiveHolders, LiveTx, LiveWhale } from "@/services/recodeService";
import type { LiveMarketRow } from "@/services/recodeService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PriceChart } from "@/components/charts/PriceChart";
import { Panel, Tag, Chip } from "@/components/ui/primitives";
import { WhaleIntelPanel } from "@/components/whales/WhaleIntelPanel";
import { CopyButton } from "@/components/ui/states";
import { UpdatedAgo, LiveStatusBadge } from "@/components/ui/LiveStatus";
import { PanelHeader } from "@/components/kit/Kit";
import { sessionLabel } from "@/lib/tradingSession";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import {
  changeTone,
  fmtPct,
  fmtPrice,
  fmtUsd,
  fmtNum,
  shortAddr,
  shortHash,
  timeAgo,
  EVM_ADDRESS_RE,
  explorerAddrUrl,
} from "@/lib/format";

const TFS = ["1H", "4H", "24H", "7D", "30D"] as const;
type Tab = "overview" | "holders" | "transactions" | "whales";

export function AssetView({ symbol }: { symbol: string }) {
  const markets = useLiveMarkets("24H");
  const [tf, setTf] = useState<(typeof TFS)[number]>("24H");
  const [tab, setTab] = useState<Tab>("overview");
  const key = symbol.toUpperCase();
  const row = useMemo(
    () =>
      (markets.data ?? []).find(
        (m) => (m.symbol ?? "").toUpperCase() === key || m.address.toLowerCase() === symbol.toLowerCase(),
      ),
    [markets.data, symbol, key],
  );
  const candles = useSyncPolling<LiveCandle[]>(
    `/api/sync/candles?symbol=${encodeURIComponent(key)}&tf=${tf.toLowerCase()}`,
    15_000,
  );
  const holders = useSyncPolling<LiveHolders>(`/api/sync/holders?symbol=${encodeURIComponent(key)}`, 30_000);
  const txs = useSyncPolling<LiveTx[]>(`/api/sync/transactions?symbol=${encodeURIComponent(key)}`, 6_000);
  const whales = useSyncPolling<LiveWhale[]>("/api/sync/whales", 10_000);

  const isAddr = EVM_ADDRESS_RE.test(symbol.toLowerCase());
  const contract = row?.address ?? (isAddr ? symbol.toLowerCase() : null);
  const explorer = contract ? explorerAddrUrl("https://robinhoodchain.blockscout.com", contract) : null;
  const whaleRows = (whales.data ?? []).filter((w) => (w.symbol ?? "").toUpperCase() === key);
  // Server-derived from official tradingCapabilities + provider halt flag.
  // When unavailable we show nothing rather than assuming NYSE hours.
  const tradingStatus = row?.tradingStatus ?? null;

  /* Auto-register what this page already knows with the RECODE Agent. */
  useAgentPageContext(
    row
      ? {
          asset: {
            symbol: row.symbol,
            name: row.name,
            contractAddress: row.address,
            assetType: row.assetType,
            price: row.price,
            change24hPct: row.change24hPct,
            volume24h: row.volume24h,
            bid: row.bid,
            ask: row.ask,
            spreadPct: row.spreadPct,
            marketCap: row.marketCap,
            liquidity: row.liquidity,
            holders: row.holders,
            tradingStatus: row.tradingStatus,
            high24h: row.high24h,
            low24h: row.low24h,
            holdersTotal: holders.data?.total ?? null,
            whaleEvents: whaleRows.length,
            dataStatus: markets.status,
          },
        }
      : null,
    tab ? `active tab: ${tab}` : undefined,
  );

  if (markets.status === "connecting" || markets.status === "syncing") {
    return <p className="py-20 text-center text-[13px] text-faint">Loading asset…</p>;
  }
  if (!row) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-lg font-semibold">{isAddr ? "Contract not indexed" : "Asset not found"}</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          {isAddr
            ? "This address exists on-chain but is not part of RECODE's verified token registry. Run it through the Contract Scanner for on-chain facts."
            : `No verified asset matches "${symbol}". RECODE only renders assets confirmed by the Robinhood Chain explorer or the official stock-token registry.`}
        </p>
        <a href="/app/markets" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
          Browse verified markets →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-green/80">
        RECODE INTELLIGENCE
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <AssetLogo symbol={row.symbol} url={row.logoUrl} size={44} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{row.symbol}</h1>
              <Tag tone="green">{row.assetType}</Tag>
              {row.verified ? <Tag tone="pos">Verified</Tag> : null}
              <Tag>Robinhood Chain</Tag>
              {tradingStatus ? (
                <Tag tone={tradingStatus === "HALTED" ? "neg" : tradingStatus === "CLOSED" ? "neutral" : "pos"}>
                  {tradingStatus}
                </Tag>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">{row.name ?? "Tokenized asset"}</p>
            {contract ? (
              <p className="tnum mt-1 flex items-center gap-2 text-[11px] text-faint">
                {shortAddr(contract)}
                <CopyButton text={contract} />
                {explorer ? (
                  <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">
                    Explorer ↗
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-[26px] font-semibold">{row.price != null ? fmtPrice(row.price) : "—"}</div>
          <div className={`tnum text-[13px] ${changeTone(row.change24hPct)}`}>
            {fmtPct(row.change24hPct)} · 24H
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <LiveStatusBadge status={row.dataStatus === "unavailable" ? "unavailable" : row.dataStatus} />
            <UpdatedAgo ts={row.updatedAt} />
          </div>
        </div>
      </div>

      <MetricStrip row={row} />

      <Panel className="mt-4">
        <PanelHeader
          title={`${row.symbol} price`}
          sub="Observed on-chain ticks and provider prices — never interpolated"
          right={
            <div className="flex gap-1">
              {TFS.map((t) => (
                <Chip key={t} active={tf === t} onClick={() => setTf(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          }
        />
        <PriceChart
          points={(candles.data ?? []).map((c) => ({ t: c.t, c: c.c }))}
          timeframe={tf}
          height={280}
        />
      </Panel>

      <div className="mt-4 flex gap-1">
        {(["overview", "holders", "transactions", "whales"] as Tab[]).map((t) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Chip>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" ? <OverviewTab row={row} /> : null}
        {tab === "holders" ? <HoldersTab holders={holders} /> : null}
        {tab === "transactions" ? <TxTab txs={txs} /> : null}
        {tab === "whales" ? <WhaleTab whales={whaleRows} symbol={row.symbol ?? ""} address={row.address} /> : null}
      </div>
    </div>
  );
}

function MetricStrip({ row }: { row: LiveMarketRow }) {
  const cells: [string, string][] = [
    ["Market Cap", fmtUsd(row.marketCap)],
    ["FDV", fmtUsd(row.fdv)],
    ["Volume 24H", fmtUsd(row.volume24h)],
    ["Liquidity", row.liquidity != null ? fmtUsd(row.liquidity) : "Data unavailable"],
    ["Holders", row.holders != null ? fmtNum(row.holders) : "Data unavailable"],
    [
      "Bid / Ask / Spread",
      row.bid != null && row.ask != null
        ? `${fmtPrice(row.bid)} / ${fmtPrice(row.ask)}${row.spreadPct != null ? ` (${row.spreadPct.toFixed(2)}%)` : ""}`
        : "—",
    ],
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-panel px-3.5 py-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
          <div className="tnum mt-1 text-[13.5px] font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="tnum text-right text-text">{v}</dd>
    </div>
  );
}

function OverviewTab({ row }: { row: LiveMarketRow }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="On-chain token" sub="The asset living on Robinhood Chain" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Symbol" v={row.symbol ?? "—"} />
          <Row k="Name" v={row.name ?? "—"} />
          <Row k="Contract" v={<span className="tnum">{shortAddr(row.address, 10, 8)}</span>} />
          <Row k="Standard" v={row.tokenStandard ?? "—"} />
          <Row k="Network" v="Robinhood Chain (4663)" />
          <Row
            k="Token status"
            v={
              row.tradingStatus ? (
                <Tag tone={row.tradingStatus === "HALTED" ? "neg" : row.tradingStatus === "CLOSED" ? "neutral" : "pos"}>
                  {row.tradingStatus}
                </Tag>
              ) : (
                "—"
              )
            }
          />
          <Row k="Registry" v={row.verified ? "Verified" : "Unverified"} />
          <Row k="First seen" v={new Date(row.firstSeen).toLocaleDateString()} />
          <Row k="Data source" v={row.dataSources?.price ?? row.source} />
          <Row k="Last updated" v={<UpdatedAgo ts={row.updatedAt} prefix="" />} />
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Live quote" sub="Official bid/ask — mid = (bid+ask)/2" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Price (mid)" v={row.price != null ? fmtPrice(row.price) : "—"} />
          <Row k="Bid" v={row.bid != null ? fmtPrice(row.bid) : "—"} />
          <Row k="Ask" v={row.ask != null ? fmtPrice(row.ask) : "—"} />
          <Row k="Spread" v={row.spreadPct != null ? `${row.spreadPct.toFixed(2)}%` : "—"} />
          <Row k="High 24H" v={row.high24h != null ? fmtPrice(row.high24h) : "—"} />
          <Row k="Low 24H" v={row.low24h != null ? fmtPrice(row.low24h) : "—"} />
          <Row k="Trading session" v={sessionLabel(row.tradingCapabilities)} />
        </dl>
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
          Mid-price = (bid + ask) / 2, falling back to the available side when one is missing.
          The official Robinhood price API is cached server-side for ~15 seconds — RECODE never
          presents it as tick-by-tick streaming data.
        </p>
      </Panel>
      <Panel>
        <PanelHeader title="Underlying asset" sub="Provider-verified reference — not a claim" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Underlying" v={row.underlying ?? "—"} />
          <Row k="Ticker" v={row.underlyingSymbol ?? "—"} />
          <Row k="Type" v={row.underlyingAssetType ?? "—"} />
          <Row
            k="Underlying market cap"
            v={row.underlyingMarketCap != null ? fmtUsd(row.underlyingMarketCap) : "Data unavailable"}
          />
          <Row k="Sector" v={row.sector ?? "Unknown"} />
          <Row k="Industry" v={row.industry ?? "—"} />
        </dl>
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
          The underlying security is context, not a claim. RECODE does not imply that the token
          grants ownership rights, dividends or legal claims in the underlying asset — rights are
          defined by the token's own product documentation.
        </p>
      </Panel>
    </div>
  );
}

function HoldersTab({
  holders,
}: {
  holders: { data: LiveHolders | null; status: string };
}) {
  const h = holders.data;
  if (!h) {
    return (
      <p className="py-8 text-center text-[12.5px] text-faint">
        Holder distribution unavailable — on-chain holder indexing has not produced data for this
        asset yet.
      </p>
    );
  }
  const top = (h.top ?? []).slice(0, 10);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel>
        <PanelHeader title="Holder metrics" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Total holders" v={h.total != null ? fmtNum(h.total) : "—"} />
          <Row k="New (24h)" v={h.new24h != null ? fmtNum(h.new24h) : "—"} />
          <Row k="Lost (24h)" v={h.lost24h != null ? fmtNum(h.lost24h) : "—"} />
          <Row k="Growth" v={h.growthPct != null ? fmtPct(h.growthPct) : "—"} />
          <Row k="Top-10 concentration" v={h.concentration != null ? `${h.concentration.toFixed(1)}%` : "—"} />
        </dl>
      </Panel>
      <Panel className="lg:col-span-2">
        <PanelHeader title="Top holders" sub="Balances verified from the Robinhood Chain explorer" />
        <ul>
          {top.map((t, i) => (
            <li key={`${t.address ?? i}`} className="flex items-center gap-3 border-b border-line-soft py-2 text-[12.5px]">
              <span className="tnum w-5 text-faint">{i + 1}</span>
              <span className="tnum flex-1 truncate text-muted">{t.address ? shortHash(t.address, 10, 8) : "—"}</span>
              <span className="tnum w-24 text-right">{t.sharePct != null ? `${t.sharePct.toFixed(2)}%` : "—"}</span>
              <span className="tnum w-24 text-right text-muted">{fmtUsd(t.usd)}</span>
            </li>
          ))}
          {top.length === 0 ? <li className="py-6 text-center text-faint">No holder rows indexed yet</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

function TxTab({ txs }: { txs: { data: LiveTx[] | null; status: string } }) {
  const rows = txs.data ?? [];
  if (rows.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-faint">No verified transactions indexed yet.</p>;
  }
  return (
    <Panel padded={false}>
      <ul>
        {rows.slice(0, 40).map((t) => (
          <li key={t.id ?? `${t.hash}-${t.ts}-${t.action}-${t.wallet}-${t.amount ?? 0}`} className="row-hover flex items-center gap-3 border-b border-line-soft px-4 py-2.5 text-[12.5px]">
            <Tag tone={t.action === "buy" ? "pos" : t.action === "sell" ? "neg" : "neutral"}>{t.action}</Tag>
            <span className="tnum flex-1 truncate">
              {shortHash(t.hash, 10, 8)} · {t.wallet ? shortHash(t.wallet) : "unknown"}
            </span>
            <span className="tnum w-28 text-right">{t.amount != null ? fmtNum(t.amount) : "—"}</span>
            <span className="tnum w-24 text-right">{fmtUsd(t.usd)}</span>
            <span className="tnum w-20 text-right text-faint">{timeAgo(t.ts)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WhaleTab({ whales, symbol, address }: { whales: LiveWhale[]; symbol: string; address: string }) {
  return (
    <div className="space-y-4">
      <WhaleIntelPanel symbol={symbol} address={address} />
      {whales.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-faint">
          No whale flows ≥ $10,000 indexed for this asset yet.
        </p>
      ) : (
        <Panel padded={false}>
          <ul>
            {whales.slice(0, 30).map((w) => (
              <li key={w.id} className="row-hover flex items-center gap-3 border-b border-line-soft px-4 py-2.5 text-[12.5px]">
                <Tag
                  tone={
                    w.kind === "buy" || w.kind === "accumulation" ? "pos" : w.kind === "sell" || w.kind === "distribution" ? "neg" : "neutral"
                  }
                >
                  {w.kind}
                </Tag>
                <span className="tnum flex-1 truncate">{w.wallet ? shortHash(w.wallet) : "unknown wallet"}</span>
                <span className="tnum w-24 text-right font-medium">{fmtUsd(w.usd)}</span>
                <span className="tnum w-20 text-right text-faint">{timeAgo(w.ts)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}


