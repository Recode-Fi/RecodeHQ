"use client";

/**
 * Asset Intelligence workspace — SELECT ASSET → SEE CHART → UNDERSTAND →
 * ANALYZE. Left selector (search + categories + sparklines) over the shared
 * verified market store (single source of truth, no refetch on select); the
 * selected asset drives a large chart workspace with an 8-tab intelligence
 * deck. Only per-asset data (candles/holders/txs) is polled for the active
 * asset — the universe itself is never refetched on selection.
 */
import { useEffect, useMemo, useState } from "react";
import { useLiveMarkets, useSyncPolling, useIntelligence } from "@/hooks/useSync";
import type { LiveCandle, LiveHolders, LiveMarketRow, LiveTx, LiveWhale, LiveIntelligence } from "@/services/recodeService";
import type { ContractIntel } from "@/lib/types";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PriceChart } from "@/components/charts/PriceChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { Panel, Tag, Chip } from "@/components/ui/primitives";
import { NetworkIcon } from "@/components/ui/NetworkIcon";
import { WhaleIntelPanel } from "@/components/whales/WhaleIntelPanel";
import { CopyButton } from "@/components/ui/states";
import { PanelHeader } from "@/components/kit/Kit";
import {
  changeTone,
  fmtPct,
  fmtPrice,
  fmtUsd,
  fmtNum,
  shortAddr,
  shortHash,
  timeAgo,
  explorerAddrUrl,
} from "@/lib/format";

const CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tokenized-stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "treasury", label: "Treasuries" },
  { id: "commodity", label: "Commodities" },
  { id: "fund", label: "Funds" },
  { id: "other", label: "Other RWAs" },
];

/* tf selector -> candles API timeframes (verified supported set) */
const TF_OPTIONS: { tf: string; label: string }[] = [
  { tf: "1h", label: "1H" },
  { tf: "4h", label: "4H" },
  { tf: "1d", label: "1D" },
  { tf: "1w", label: "1W" },
];

type Tab =
  | "overview"
  | "market"
  | "holders"
  | "whales"
  | "liquidity"
  | "transactions"
  | "contract"
  | "signals";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "market", label: "Market" },
  { id: "holders", label: "Holders" },
  { id: "whales", label: "Whales" },
  { id: "liquidity", label: "Liquidity" },
  { id: "transactions", label: "Transactions" },
  { id: "contract", label: "Contract" },
  { id: "signals", label: "Signals" },
];

function freshnessLabel(row: LiveMarketRow | null): { label: string; live: boolean } {
  if (!row || row.updatedAt == null) return { label: "Data unavailable", live: false };
  const live = row.dataStatus === "live";
  return { label: `${live ? "LIVE" : "UPDATING"} · updated ${timeAgo(row.updatedAt)}`, live };
}

/** Same contract as useAsyncData but deferred: fetch starts only when enabled. */
function useDeferredData<T>(enabled: boolean, path: string | null) {
  const [state, setState] = useState<{ status: string; data: T | null; error?: string }>({
    status: "empty",
    data: null,
  });
  useEffect(() => {
    if (!enabled || !path) return;
    let cancelled = false;
    setState({ status: "connecting", data: null });
    fetch(path, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { status: "unavailable", data: null }))
      .then((r) => {
        if (!cancelled) setState(r as { status: string; data: T | null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, path]);
  return state;
}

export function AssetIntelligenceView({ initialSymbol }: { initialSymbol?: string }) {
  const markets = useLiveMarkets("24H");
  const rows = markets.data ?? [];

  /* Deep link: /app/assets?asset=SPY (symbol or contract). */
  const [selected, setSelected] = useState<string | null>(initialSymbol?.toUpperCase() ?? null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("asset");
    if (q) setSelected(q.toUpperCase());
  }, []);

  /* Auto-select the first verified asset once the universe arrives. */
  useEffect(() => {
    if (!selected && rows.length > 0) {
      setSelected((rows[0].symbol ?? rows[0].address).toUpperCase());
    }
  }, [rows, selected]);

  const select = (s: string) => {
    setSelected(s.toUpperCase());
    const url = new URL(window.location.href);
    url.searchParams.set("asset", s.toUpperCase());
    window.history.replaceState(null, "", url.toString());
  };

  /* Selector state */
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const filtered = useMemo(() => {
    let out = cat === "all" ? rows : rows.filter((r) => r.assetType === cat);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          (r.symbol ?? "").toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q) ||
          r.address.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, query, cat]);

  const row = useMemo(
    () =>
      rows.find(
        (r) =>
          (r.symbol ?? "").toUpperCase() === selected ||
          r.address.toUpperCase() === selected,
      ) ?? null,
    [rows, selected],
  );
  const key = (row?.symbol ?? selected ?? "").toUpperCase();
  const contract = row?.address ?? null;

  /* Only the active asset's data is polled (dedup + cache via useSyncPolling). */
  const [tf, setTf] = useState("1d");
  const [mode, setMode] = useState<"price" | "volume">("price");
  const candles = useSyncPolling<LiveCandle[]>(
    key ? `/api/sync/candles?symbol=${encodeURIComponent(key)}&tf=${tf}` : "/api/sync/candles",
    15_000,
  );
  const holders = useSyncPolling<LiveHolders>(
    key ? `/api/sync/holders?symbol=${encodeURIComponent(key)}` : "/api/sync/holders",
    30_000,
  );
  const txs = useSyncPolling<LiveTx[]>(
    key ? `/api/sync/transactions?symbol=${encodeURIComponent(key)}` : "/api/sync/transactions",
    6_000,
  );
  const whales = useSyncPolling<LiveWhale[]>("/api/sync/whales", 10_000);
  const intelligence = useIntelligence(key);
  const [tab, setTab] = useState<Tab>("overview");
  /* Contract facts fetched only when the Contract tab is opened. */
  const contractInfo = useDeferredData<ContractIntel>(
    tab === "contract" && key !== "",
    key ? `/api/contract?symbol=${encodeURIComponent(key)}` : null,
  );

  const whaleRows = (whales.data ?? []).filter((w) => (w.symbol ?? "").toUpperCase() === key);
  const freshness = freshnessLabel(row);
  const explorer = contract ? explorerAddrUrl("https://robinhoodchain.blockscout.com", contract) : null;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)]">
        {/* ---------- LEFT: ASSET SELECTOR (desktop) ---------- */}
        <aside
          aria-label="Asset selector"
          className="hidden lg:sticky lg:top-16 lg:block lg:max-h-[calc(100dvh-96px)] lg:overflow-hidden"
        >
          <Panel padded={false} className="flex max-h-[calc(100dvh-96px)] flex-col">
            <div className="px-3.5 pb-2 pt-3 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">
              Select Asset
            </div>
            <div className="px-2.5 pb-2.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search assets…"
                aria-label="Search assets"
                className="h-8 w-full rounded-[4px] border border-line bg-panel-2 px-2.5 text-[12px] outline-none placeholder:text-faint focus:border-green/40"
              />
            </div>
            <div className="flex flex-wrap gap-1 border-b border-line px-2.5 pb-2.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  aria-pressed={cat === c.id}
                  className={`rounded-[3px] px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                    cat === c.id ? "bg-green-soft text-green" : "text-faint hover:text-muted"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Assets">
              {markets.status === "connecting" || markets.status === "syncing" ? (
                <li className="px-3.5 py-10 text-center text-[11.5px] text-faint">Loading universe…</li>
              ) : filtered.length === 0 ? (
                <li className="px-3.5 py-10 text-center text-[11.5px] text-faint">No verified assets match.</li>
              ) : (
                filtered.map((r) => {
                  const isSel = row != null && r.address === row.address;
                  return (
                    <li key={r.address}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => select((r.symbol ?? r.address).toUpperCase())}
                        className={`row-hover flex w-full items-center gap-2.5 border-b border-line-soft px-3 py-2 text-left transition-colors ${
                          isSel ? "border-l-2 border-l-accent bg-green-soft/60" : ""
                        }`}
                      >
                        <AssetLogo symbol={r.symbol} url={r.logoUrl} size={22} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[12px] font-semibold ${isSel ? "text-green" : ""}`}>
                              {r.symbol ?? shortHash(r.address)}
                            </span>
                            <span className="truncate text-[10px] text-faint">
                              {(r.name ?? "Tokenized asset").replace(/\s*•\s*Robinhood Token\s*$/i, "")}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="tnum text-[10.5px] text-faint">
                              {r.price != null ? fmtPrice(r.price) : "—"}
                            </span>
                            <span className={`tnum text-[10.5px] ${changeTone(r.change24hPct)}`}>
                              {fmtPct(r.change24hPct)}
                            </span>
                          </span>
                        </span>
                        {r.sparkline?.length > 2 ? (
                          <Sparkline points={r.sparkline} width={44} height={18} />
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t border-line px-3.5 py-2 text-[10px] text-faint">
              {filtered.length} verified assets · live registry
            </div>
          </Panel>
        </aside>

        {/* ---------- RIGHT: WORKSPACE ---------- */}
        <main className="min-w-0">
          {/* Mobile: compact dropdown selector */}
          <div className="mb-3 lg:hidden">
            <Panel padded={false}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Asset
                </span>
                <select
                  value={selected ?? ""}
                  onChange={(e) => select(e.target.value)}
                  aria-label="Select asset"
                  className="h-8 w-full rounded-[4px] border border-line bg-panel-2 px-2 text-[12px] outline-none focus:border-green/40"
                >
                  {rows.map((r) => (
                    <option key={r.address} value={(r.symbol ?? r.address).toUpperCase()}>
                      {r.symbol ?? shortHash(r.address)} —{" "}
                      {r.name?.replace(/\s*•\s*Robinhood Token\s*$/i, "") ?? "Tokenized asset"}
                    </option>
                  ))}
                </select>
              </div>
            </Panel>
          </div>

          {!row ? (
            markets.status === "connecting" || markets.status === "syncing" ? (
              <p className="py-16 text-center text-[12.5px] text-faint">Loading asset intelligence…</p>
            ) : (
              <p className="rounded-[6px] border border-dashed border-line px-6 py-16 text-center text-[12.5px] text-faint">
                Select an asset to begin
              </p>
            )
          ) : (
            <Workspace
              row={row}
              tf={tf}
              setTf={setTf}
              mode={mode}
              setMode={setMode}
              candles={candles}
              holders={holders}
              txs={txs}
              whaleRows={whaleRows}
              freshness={freshness}
              explorer={explorer}
              tab={tab}
              setTab={setTab}
              contractInfo={contractInfo}
              intelligence={intelligence}
            />
          )}
        </main>
      </div>
    </div>
  );
}

interface WorkspaceProps {
  row: LiveMarketRow;
  tf: string;
  setTf: (v: string) => void;
  mode: "price" | "volume";
  setMode: (v: "price" | "volume") => void;
  candles: { status: string; data: LiveCandle[] | null };
  holders: { status: string; data: LiveHolders | null };
  txs: { status: string; data: LiveTx[] | null };
  whaleRows: LiveWhale[];
  freshness: { label: string; live: boolean };
  explorer: string | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  contractInfo: { status: string; data: ContractIntel | null; error?: string };
  intelligence: { status: string; data: LiveIntelligence | null };
}

function Workspace({
  row,
  tf,
  setTf,
  mode,
  setMode,
  candles,
  holders,
  txs,
  whaleRows,
  freshness,
  explorer,
  tab,
  setTab,
  contractInfo,
  intelligence,
}: WorkspaceProps) {
  return (
    <>
      {/* Asset header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <AssetLogo symbol={row.symbol} url={row.logoUrl} size={44} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{row.symbol}</h1>
              <Tag tone="green">{row.assetType}</Tag>
              {row.verified ? <Tag tone="pos">Verified</Tag> : null}
              <Tag>
                <span className="inline-flex items-center gap-1.5">
                  <NetworkIcon id="robinhood-chain" size={12} />
                  Robinhood Chain
                </span>
              </Tag>
              <span
                className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                  freshness.live ? "text-green" : "text-muted"
                }`}
              >
                <span className={freshness.live ? "live-dot" : "h-1.5 w-1.5 rounded-full bg-line-strong"} />
                {freshness.live ? "LIVE" : freshness.label.split("·")[0].trim()}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">{row.name ?? "Tokenized asset"}</p>
            <p className="tnum mt-1 flex items-center gap-2 text-[11px] text-faint">
              {shortAddr(row.address)}
              <CopyButton text={row.address} />
              {explorer ? (
                <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">
                  Explorer ↗
                </a>
              ) : null}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-[28px] font-semibold leading-tight">
            {row.price != null ? fmtPrice(row.price) : "—"}
          </div>
          <div className={`tnum text-[13px] ${changeTone(row.change24hPct)}`}>
            {fmtPct(row.change24hPct)} · 24H
          </div>
          <div className="mt-0.5 text-[10px] text-faint">{freshness.label}</div>
        </div>
      </div>

      {/* LARGE CHART — centerpiece */}
      <Panel>
        <PanelHeader
          title={`${row.symbol} ${mode === "volume" ? "volume" : "price"}`}
          sub="Observed on-chain ticks and provider prices — never interpolated"
          right={
            <div className="flex flex-wrap items-center gap-1">
              {(["price", "volume"] as const).map((m) => (
                <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
                  {m === "price" ? "Price" : "Volume"}
                </Chip>
              ))}
              <span className="mx-1 h-4 w-px bg-line" />
              {TF_OPTIONS.map((t) => (
                <Chip key={t.tf} active={tf === t.tf} onClick={() => setTf(t.tf)}>
                  {t.label}
                </Chip>
              ))}
              <span
                title="6M/1Y/ALL unlock as the observed-tick window grows — never interpolated"
                className="cursor-help px-1.5 py-0.5 text-[10.5px] text-faint"
              >
                6M+
              </span>
            </div>
          }
        />
        {candles.status === "connecting" ? (
          <div
            className="flex items-center justify-center rounded-[6px] border border-dashed border-line text-[12px] text-faint"
            style={{ height: 420 }}
          >
            Loading chart…
          </div>
        ) : (candles.data ?? []).length < 2 ? (
          <div
            className="flex items-center justify-center rounded-[6px] border border-dashed border-line text-[12px] text-faint"
            style={{ height: 420 }}
          >
            Historical data unavailable for this timeframe — observed ticks are recorded continuously
          </div>
        ) : (
          <PriceChart
            points={(candles.data ?? []).map((c) => ({ t: c.t, c: c.c, v: c.v }))}
            timeframe={tf.toUpperCase()}
            mode={mode}
            height={420}
          />
        )}
      </Panel>

      <MetricStrip row={row} holdersCount={holders.data?.total ?? null} />

      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Asset intelligence tabs">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="mt-3" role="tabpanel">
        {tab === "overview" ? <OverviewTab row={row} intel={intelligence} /> : null}
        {tab === "market" ? <MarketTab row={row} /> : null}
        {tab === "holders" ? <HoldersTab holders={holders} /> : null}
        {tab === "whales" ? <WhaleTab whales={whaleRows} row={row} /> : null}
        {tab === "liquidity" ? <LiquidityTab row={row} /> : null}
        {tab === "transactions" ? <TxTab txs={txs} /> : null}
        {tab === "contract" ? (
          <ContractTab info={contractInfo} contract={row.address} symbol={row.symbol ?? ""} />
        ) : null}
        {tab === "signals" ? <SignalsTab row={row} whales={whaleRows} /> : null}
      </div>
    </>
  );
}

function MetricStrip({ row, holdersCount }: { row: LiveMarketRow; holdersCount: number | null }) {
  const cells: [string, string][] = [
    ["Market Cap", (row.marketCap ?? row.fdv) != null ? fmtUsd(row.marketCap ?? row.fdv) : "—"],
    ["24H Volume", row.volume24h != null ? fmtUsd(row.volume24h) : "—"],
    ["Liquidity", row.liquidity != null ? fmtUsd(row.liquidity) : "—"],
    [
      "Holders",
      (row.holders ?? holdersCount) != null ? fmtNum((row.holders ?? holdersCount) as number) : "—",
    ],
    [
      "Transactions",
      row.buys24h != null || row.sells24h != null ? fmtNum((row.buys24h ?? 0) + (row.sells24h ?? 0)) : "—",
    ],
    ["Bid / Ask", row.bid != null && row.ask != null ? `${fmtPrice(row.bid)} / ${fmtPrice(row.ask)}` : "—"],
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-panel px-3.5 py-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
          <div className="tnum mt-1 text-[13px] font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tnum text-right text-text">{v}</dd>
    </div>
  );
}

function OverviewTab({ row, intel }: { row: LiveMarketRow; intel: { data: LiveIntelligence | null; status: string } }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Asset summary" sub="Verified registry facts" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Name" v={row.name?.replace(/\s*•\s*Robinhood Token\s*$/i, "") ?? "—"} />
          <Row k="Symbol" v={row.symbol ?? "—"} />
          <Row k="Category" v={row.assetType} />
          <Row k="Chain" v="Robinhood Chain (4663)" />
          <Row k="Contract" v={<span className="tnum">{shortAddr(row.address, 10, 8)}</span>} />
          <Row k="Standard" v={row.tokenStandard ?? "—"} />
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Market summary" sub="Live from verified providers" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Price" v={row.price != null ? fmtPrice(row.price) : "—"} />
          <Row k="24H change" v={<span className={changeTone(row.change24hPct)}>{fmtPct(row.change24hPct)}</span>} />
          <Row k="Market cap" v={fmtUsd(row.marketCap)} />
          <Row k="24H volume" v={fmtUsd(row.volume24h)} />
          <Row k="Liquidity" v={row.liquidity != null ? fmtUsd(row.liquidity) : "Data unavailable"} />
        </dl>
      </Panel>
      <IntelligencePanel intel={intel} />
      <Panel className="lg:col-span-2">
        <PanelHeader title="Intelligence summary" sub="Observed behavior — signals only when backed by data" />
        <SignalsList row={row} whales={[]} />
      </Panel>
    </div>
  );
}

/**
 * Intelligence scores — every value is computed server-side from the
 * verified store (deterministic formulas in src/lib/intelligence.ts).
 * A metric without enough data renders "—" plus the reason; nothing
 * is ever randomly assigned.
 */
function IntelligencePanel({ intel }: { intel: { data: LiveIntelligence | null; status: string } }) {
  const d = intel.data;
  if (intel.status === "connecting" || intel.status === "syncing") {
    return (
      <Panel>
        <PanelHeader title="Intelligence scores" />
        <p className="py-6 text-center text-[12.5px] text-faint">Computing from verified history…</p>
      </Panel>
    );
  }
  if (!d) {
    return (
      <Panel>
        <PanelHeader title="Intelligence scores" />
        <p className="py-6 text-center text-[12.5px] text-faint">
          No verified price history for this asset yet — scores stay empty until real candles exist.
        </p>
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelHeader
        title="Intelligence scores"
        sub={`Deterministic formulas · confidence ${Math.round(d.dataConfidence * 100)}% · ${d.inputs.candleTimeframe ?? "—"} candles (${d.inputs.candleCount})`}
      />
      <dl className="space-y-2 text-[12.5px]">
        <Row
          k="Momentum"
          v={d.momentum ? `${d.momentum.score}/100` : "—"}
        />
        <Row k="Momentum basis" v={<span className="text-faint">{d.momentum?.basis ?? d.unavailable.find((u) => u.startsWith("Momentum")) ?? "—"}</span>} />
        <Row
          k="Volume activity"
          v={
            d.volumeActivity ? (
              <Tag
                tone={d.volumeActivity.label === "HIGH" ? "pos" : d.volumeActivity.label === "LOW" ? "warn" : "neutral"}
              >
                {d.volumeActivity.label}
              </Tag>
            ) : (
              "—"
            )
          }
        />
        <Row
          k="Liquidity"
          v={
            d.liquidity ? (
              <>
                {d.liquidity.label} · {d.liquidity.score}/100
              </>
            ) : (
              "—"
            )
          }
        />
        <Row
          k="Volatility (realized)"
          v={d.volatility ? <Tag tone={d.volatility.label === "HIGH" ? "warn" : "neutral"}>{d.volatility.label}</Tag> : "—"}
        />
        <Row
          k="Trend"
          v={
            d.trend ? (
              <Tag tone={d.trend.label === "BULLISH" ? "pos" : d.trend.label === "BEARISH" ? "neg" : "neutral"}>
                {d.trend.label}
              </Tag>
            ) : (
              "—"
            )
          }
        />
      </dl>
      <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
        Momentum: weighted 1h/24h/7d log returns + volume acceleration. Liquidity: 24h volume vs
        reference + bid/ask spread. Volatility: annualized realized stddev. Trend: SMA(fast) vs
        SMA(slow). Thresholds are configurable (RECODE_*_THRESHOLDS env). Metrics below "—"
        indicate missing verified inputs, never zero.
      </p>
    </Panel>
  );
}

function MarketTab({ row }: { row: LiveMarketRow }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Trading" sub="Verified bid/ask and volumes" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Price" v={row.price != null ? fmtPrice(row.price) : "—"} />
          <Row
            k="Bid / Ask"
            v={row.bid != null && row.ask != null ? `${fmtPrice(row.bid)} / ${fmtPrice(row.ask)}` : "—"}
          />
          <Row k="24H volume" v={fmtUsd(row.volume24h)} />
          <Row k="Buy volume 24H" v={row.buyVolume24h != null ? fmtUsd(row.buyVolume24h) : "—"} />
          <Row k="Sell volume 24H" v={row.sellVolume24h != null ? fmtUsd(row.sellVolume24h) : "—"} />
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Size" sub="Market cap and supply-derived value" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Market cap" v={fmtUsd(row.marketCap)} />
          <Row k="FDV" v={fmtUsd(row.fdv)} />
          <Row k="Underlying mcap" v={fmtUsd(row.underlyingMarketCap)} />
          <Row k="24H change" v={<span className={changeTone(row.change24hPct)}>{fmtPct(row.change24hPct)}</span>} />
          <Row k="Liquidity" v={row.liquidity != null ? fmtUsd(row.liquidity) : "Data unavailable"} />
        </dl>
      </Panel>
    </div>
  );
}

function HoldersTab({ holders }: { holders: { status: string; data: LiveHolders | null } }) {
  if (holders.status === "connecting") {
    return <p className="py-10 text-center text-[12.5px] text-faint">Loading holders…</p>;
  }
  const h = holders.data;
  if (!h || h.total == null) {
    return (
      <p className="py-10 text-center text-[12.5px] text-faint">
        Holder data unavailable — the explorer is not responding (current 403 challenge).
      </p>
    );
  }
  const top = h.top ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Distribution" sub="Verified from on-chain indexing" />
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
            <li
              key={`${t.address ?? "row"}-${i}`}
              className="row-hover flex items-center gap-3 border-b border-line-soft py-2 text-[12.5px]"
            >
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

function WhaleTab({ whales, row }: { whales: LiveWhale[]; row: LiveMarketRow }) {
  return (
    <div className="space-y-4">
      <WhaleIntelPanel symbol={row.symbol ?? ""} address={row.address} />
      {whales.length === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-faint">
          No whale flows ≥ $10,000 indexed for this asset yet.
        </p>
      ) : (
        <WhaleFlows whales={whales} />
      )}
    </div>
  );
}

function WhaleFlows({ whales }: { whales: LiveWhale[] }) {
  const buys = whales.filter((w) => w.kind === "buy" || w.kind === "accumulation");
  const sells = whales.filter((w) => w.kind === "sell" || w.kind === "distribution");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <PanelHeader title="Accumulation" sub="Verified buys + accumulation events" />
          <div className="tnum text-[20px] font-semibold text-pos">
            {buys.length} · {fmtUsd(buys.reduce((a, w) => a + (w.usd ?? 0), 0))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Distribution" sub="Verified sells + distribution events" />
          <div className="tnum text-[20px] font-semibold text-neg">
            {sells.length} · {fmtUsd(sells.reduce((a, w) => a + (w.usd ?? 0), 0))}
          </div>
        </Panel>
      </div>
      <Panel padded={false}>
        <PanelHeader title="Large movements" sub="Verified large transfers ≥ $10,000" />
        <ul>
          {whales.slice(0, 30).map((w) => (
            <li
              key={w.id}
              className="row-hover flex items-center gap-3 border-b border-line-soft px-4 py-2.5 text-[12.5px]"
            >
              <Tag
                tone={
                  w.kind === "buy" || w.kind === "accumulation"
                    ? "pos"
                    : w.kind === "sell" || w.kind === "distribution"
                      ? "neg"
                      : "neutral"
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
    </div>
  );
}

function LiquidityTab({ row }: { row: LiveMarketRow }) {
  return (
    <Panel>
      <PanelHeader title="Liquidity" sub="DEX pools and reserves" />
      <p className="py-8 text-center text-[12.5px] text-faint">
        No DEX indexer configured — pool data is structurally unavailable in this deployment.
        Liquidity is never estimated from price or volume.
      </p>
      <dl className="space-y-2 text-[12.5px]">
        <Row k="Liquidity" v={row.liquidity != null ? fmtUsd(row.liquidity) : "Data unavailable"} />
        <Row k="Pools" v="Data unavailable" />
      </dl>
    </Panel>
  );
}

function TxTab({ txs }: { txs: { status: string; data: LiveTx[] | null } }) {
  if (txs.status === "connecting") {
    return <p className="py-10 text-center text-[12.5px] text-faint">Loading transactions…</p>;
  }
  const rows = txs.data ?? [];
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[12.5px] text-faint">No verified transactions indexed yet.</p>;
  }
  return (
    <Panel padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
              <th className="px-4 py-2 font-semibold">Hash</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">From</th>
              <th className="px-3 py-2 font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-4 py-2 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((t) => (
              <tr
                key={t.id ?? `${t.hash}-${t.ts}-${t.wallet ?? ""}-${t.amount ?? 0}`}
                className="row-hover border-b border-line-soft"
              >
                <td className="tnum px-4 py-2.5">{shortHash(t.hash, 10, 8)}</td>
                <td className="px-3 py-2.5">
                  <Tag tone={t.action === "buy" ? "pos" : t.action === "sell" ? "neg" : "neutral"}>{t.action}</Tag>
                </td>
                <td className="tnum px-3 py-2.5 text-muted">{t.wallet ? shortHash(t.wallet) : "unknown"}</td>
                <td className="tnum px-3 py-2.5">{t.amount != null ? fmtNum(t.amount) : "—"}</td>
                <td className="tnum px-3 py-2.5 text-right">{fmtUsd(t.usd)}</td>
                <td className="tnum px-4 py-2.5 text-right text-faint">{timeAgo(t.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ContractTab({
  info,
  contract,
  symbol,
}: {
  info: { status: string; data: ContractIntel | null; error?: string };
  contract: string | null;
  symbol: string;
}) {
  if (info.status === "connecting") {
    return <p className="py-10 text-center text-[12.5px] text-faint">Reading contract on-chain…</p>;
  }
  const d = info.data;
  if (!d) {
    return (
      <Panel>
        <PanelHeader title="Contract" sub="On-chain facts" />
        <p className="py-6 text-[12.5px] text-faint">
          Unable to load contract data{info.error ? ` — ${info.error}` : ""}.{" "}
          <button type="button" onClick={() => window.location.reload()} className="text-green hover:underline">
            Retry
          </button>
        </p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Contract" sub={`${symbol} on Robinhood Chain`} />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Address" v={<span className="tnum">{shortAddr(d.address, 10, 8)}</span>} />
          <Row k="Chain" v="Robinhood Chain (4663)" />
          <Row k="Contract type" v={d.contractType ?? "Unknown"} />
          <Row k="Decimals" v={d.decimals != null ? String(d.decimals) : "Not available"} />
          <Row
            k="Total supply"
            v={
              d.totalSupplyRaw
                ? (() => {
                    try {
                      const big = d.totalSupplyRaw.startsWith("0x")
                        ? BigInt(d.totalSupplyRaw)
                        : BigInt(d.totalSupplyRaw);
                      return fmtNum(Number(big) / 10 ** (d.decimals ?? 18));
                    } catch {
                      return "—";
                    }
                  })()
                : "Not available"
            }
          />
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Deployment & verification" sub="Verified facts only" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Source verified" v={d.isVerified == null ? "Not available" : d.isVerified ? "Yes" : "No"} />
          <Row k="Creator" v={d.creator ? shortHash(d.creator) : "Not available"} />
          <Row
            k="Deployed"
            v={d.deployedAt != null ? new Date(d.deployedAt).toLocaleDateString() : "Not available"}
          />
          <Row k="Proxy" v={d.isProxy == null ? "Unknown" : d.isProxy ? "Yes" : "No proxy detected"} />
          <Row
            k="Implementation"
            v={d.implementation ? <span className="tnum">{shortHash(d.implementation)}</span> : "Not available"}
          />
          <Row k="owner()" v={d.owner ? <span className="tnum">{shortHash(d.owner)}</span> : "not exposed"} />
          <Row
            k="Risk verdict"
            v={<Tag tone={d.risk === "LOW" ? "pos" : d.risk === "HIGH" ? "neg" : "warn"}>{d.risk}</Tag>}
          />
        </dl>
      </Panel>
    </div>
  );
}

function SignalsList({ row, whales }: { row: LiveMarketRow; whales: LiveWhale[] }) {
  const out: { kind: string; tone: "pos" | "neg" | "neutral"; detail: string }[] = [];
  if (row.change24hPct != null && row.volume24h != null && row.volume24h > 0) {
    if (row.change24hPct >= 3)
      out.push({
        kind: "UPWARD MOMENTUM",
        tone: "pos",
        detail: `${fmtPct(row.change24hPct)} with ${fmtUsd(row.volume24h)} verified 24h volume`,
      });
    else if (row.change24hPct <= -3)
      out.push({
        kind: "DOWNWARD MOMENTUM",
        tone: "neg",
        detail: `${fmtPct(row.change24hPct)} with ${fmtUsd(row.volume24h)} verified 24h volume`,
      });
  }
  for (const w of whales.slice(0, 3)) {
    if (w.kind === "accumulation")
      out.push({ kind: "WHALE ACCUMULATION", tone: "pos", detail: `${fmtUsd(w.usd)} — ${timeAgo(w.ts)}` });
    if (w.kind === "distribution")
      out.push({ kind: "WHALE DISTRIBUTION", tone: "neg", detail: `${fmtUsd(w.usd)} — ${timeAgo(w.ts)}` });
    if (w.kind === "buy")
      out.push({ kind: "LARGE TRANSFER", tone: "neutral", detail: `large buy ${fmtUsd(w.usd)} — ${timeAgo(w.ts)}` });
  }
  if (out.length === 0) {
    return (
      <p className="py-6 text-[12.5px] text-faint">
        No signals exceed the verified thresholds right now — RECODE only reports observed
        activity, never estimates.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {out.map((s, i) => (
        <li key={`${s.kind}-${i}`} className="flex items-center gap-3 text-[12.5px]">
          <Tag tone={s.tone}>{s.kind}</Tag>
          <span className="text-muted">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalsTab({ row, whales }: { row: LiveMarketRow; whales: LiveWhale[] }) {
  return (
    <Panel>
      <PanelHeader title="Observed signals" sub="Rule-based over verified data — never guarantees" />
      <SignalsList row={row} whales={whales} />
    </Panel>
  );
}