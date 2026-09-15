"use client";

/**
 * Wallet Intelligence workspace — public-address analysis on Robinhood
 * Chain (no wallet connection required). All values come from the
 * centralized live-data architecture: on-chain RPC balances across every
 * verified indexed contract, engine-verified prices, and real activity
 * (explorer when reachable, else the engine's measured transfer store).
 * Unavailable metrics render honest states — never fabricated.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import type { WalletBalances, WalletActivity } from "@/lib/types";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Panel, Tag } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/states";
import { PanelHeader } from "@/components/kit/Kit";
import { fmtUsd, fmtNum, fmtPrice, fmtPct, shortHash, timeAgo } from "@/lib/format";
import { NetworkIcon } from "@/components/ui/NetworkIcon";
import { useAgentPageContext } from "@/components/agent/AgentContext";

/** Large-holder threshold (verified portfolio value across priced assets). */
const WHALE_THRESHOLD_USD = 100_000;

type Tab = "holdings" | "activity" | "intelligence" | "smartmoney";

const TABS: { id: Tab; label: string }[] = [
  { id: "holdings", label: "Holdings" },
  { id: "activity", label: "Activity" },
  { id: "intelligence", label: "Intelligence" },
  { id: "smartmoney", label: "Smart Money" },
];

export function WalletIntel({ address }: { address: string }) {
  /* Live refresh: only the active wallet's data is polled (60s balances,
     30s activity — batched RPC, no hammering). */
  const balances = useSyncPolling<WalletBalances>(
    `/api/wallet/balances?address=${encodeURIComponent(address)}`,
    60_000,
  );
  const activity = useSyncPolling<WalletActivity>(
    `/api/wallet/activity?address=${encodeURIComponent(address)}`,
    30_000,
  );
  const whales = useSyncPolling<
    { id: string; wallet: string | null; symbol: string | null; usd: number | null; ts: number }[]
  >("/api/sync/whales", 30_000);
  const [tab, setTab] = useState<Tab>("holdings");

  const b = balances.data;
  const a = activity.data;

  const priced = useMemo(
    () => (b?.balances ?? []).filter((h) => h.valueUsd != null && h.valueUsd > 0),
    [b],
  );
  const total = b?.totalValueUsd ?? null;

  /* Portfolio-weighted real 24H change: Σ(value × 24h%) / total. */
  const change24h = useMemo(() => {
    if (!total || total <= 0) return null;
    const withPct = priced.filter((h) => h.change24hPct != null);
    if (withPct.length === 0) return null;
    const weighted = withPct.reduce(
      (acc, h) => acc + (h.valueUsd as number) * ((h.change24hPct as number) / 100),
      0,
    );
    return (weighted / total) * 100;
  }, [priced, total]);

  const isWhale = total != null && total >= WHALE_THRESHOLD_USD;
  const freshness = b?.updatedAt != null ? `updated ${timeAgo(b.updatedAt)}` : null;

  /* Auto-register what this wallet page already knows with the RECODE Agent. */
  useAgentPageContext({
    wallet: {
      address,
      totalValueUsd: total,
      change24hPct: change24h,
      holdingsCount: b?.balances?.length ?? null,
      topHoldings: priced.slice(0, 8).map((h) => ({
        symbol: h.symbol ?? null,
        valueUsd: h.valueUsd,
        change24hPct: h.change24hPct,
      })),
      isWhale,
      activityTxCount: a?.txCount ?? null,
      activityTransfers: a?.transfers?.length ?? null,
      balancesStatus: balances.status,
    },
  });

  /* Recent large wallets for the left selector (verified whale flows). */
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: { wallet: string; symbol: string | null; usd: number | null; ts: number }[] = [];
    for (const w of whales.data ?? []) {
      if (!w.wallet || seen.has(w.wallet) || w.wallet.toLowerCase() === address) continue;
      seen.add(w.wallet);
      out.push({ wallet: w.wallet, symbol: w.symbol, usd: w.usd, ts: w.ts });
      if (out.length >= 8) break;
    }
    return out;
  }, [whales.data, address]);

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* ---------- LEFT: analyze + recent large wallets ---------- */}
      <aside aria-label="Wallet selector" className="order-2 lg:order-1 lg:sticky lg:top-16 lg:self-start">
        <Panel padded={false}>
          <div className="px-3.5 pb-2 pt-3 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">
            Analyze a Wallet
          </div>
          <form
            className="px-2.5 pb-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem("addr") as HTMLInputElement).value
                .trim()
                .toLowerCase();
              if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
                window.location.href = `/app/wallet/${input}`;
              }
            }}
          >
            <input
              name="addr"
              placeholder="0x… public address"
              spellCheck={false}
              aria-label="Analyze another wallet"
              className="h-8 w-full rounded-[4px] border border-line bg-panel-2 px-2.5 text-[11.5px] outline-none placeholder:text-faint focus:border-green/40"
            />
          </form>
          <div className="px-3.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">
            Recently active large wallets
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {recent.length === 0 ? (
              <li className="px-3.5 py-6 text-center text-[11px] text-faint">Awaiting verified flows…</li>
            ) : (
              recent.map((w) => (
                <li key={w.wallet}>
                  <Link
                    href={`/app/wallet/${w.wallet}`}
                    className="row-hover flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2 text-[11.5px]"
                  >
                    <span className="tnum text-muted">{shortHash(w.wallet, 6, 4)}</span>
                    <span className="tnum font-medium">{fmtUsd(w.usd)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-line px-3.5 py-2 text-[10px] text-faint">
            No wallet connection needed
          </div>
        </Panel>
      </aside>

      {/* ---------- RIGHT: workspace ---------- */}
      <main className="order-1 min-w-0 lg:order-2">
        <WalletWorkspace
          address={address}
          balances={balances}
          activity={activity}
          total={total}
          change24h={change24h}
          isWhale={isWhale}
          freshness={freshness}
          tab={tab}
          setTab={setTab}
        />
      </main>
    </div>
  );
}

interface WalletWorkspaceProps {
  address: string;
  balances: { status: string; data: WalletBalances | null };
  activity: { status: string; data: WalletActivity | null };
  total: number | null;
  change24h: number | null;
  isWhale: boolean;
  freshness: string | null;
  tab: Tab;
  setTab: (t: Tab) => void;
}

function WalletWorkspace({
  address,
  balances,
  activity,
  total,
  change24h,
  isWhale,
  freshness,
  tab,
  setTab,
}: WalletWorkspaceProps) {
  return (
    <>
      <header className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-green/80">
          <span className="inline-flex items-center gap-1.5">
            <NetworkIcon id="robinhood-chain" size={13} />
            WALLET INTELLIGENCE · ROBINHOOD CHAIN (4663)
          </span>
          {isWhale ? (
            <Tag tone="pos">Large holder · ≥ {fmtUsd(WHALE_THRESHOLD_USD)} verified portfolio</Tag>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="tnum text-xl font-semibold">{shortHash(address, 10, 8)}</h1>
          <CopyButton text={address} label="Copy wallet address" />
          <a
            href={`https://robinhoodchain.blockscout.com/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] text-green hover:underline"
          >
            Explorer ↗
          </a>
          {freshness ? <span className="text-[10px] text-faint">{freshness}</span> : null}
        </div>
      </header>

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Portfolio Value"
          value={total != null ? fmtUsd(total) : balances.data ? "Data unavailable" : "—"}
        />
        <Stat
          label="24H"
          value={change24h != null ? fmtPct(change24h) : "—"}
          tone={change24h != null ? (change24h >= 0 ? "text-pos" : "text-neg") : undefined}
        />
        <Stat
          label="Transactions"
          value={activity.data?.txCount != null ? fmtNum(activity.data.txCount) : activity.data ? "Not available" : "—"}
          sub={
            activity.data?.transfersAvailable === false && activity.data?.txCount != null
              ? "RPC nonce"
              : undefined
          }
        />
        <Stat label="Assets" value={balances.data ? fmtNum(balances.data.balances.length) : "—"} />
        <Stat
          label="Transfers (indexed)"
          value={activity.data ? fmtNum(activity.data.transfers.length) : "—"}
        />
        <Stat
          label="Account Age"
          value={
            activity.data?.accountAge != null
              ? `${fmtNum(Math.floor((Date.now() - activity.data.accountAge) / 86_400_000))} d`
              : "Not available"
          }
        />
      </div>

      {/* Portfolio chart — honest: portfolio history is not recorded, so no
          line is fabricated. The panel structure is ready for real
          balance-snapshot history. */}
      <Panel className="mt-4">
        <PanelHeader
          title="Portfolio value"
          sub="Verified holdings valuation over time"
          right={<span className="text-[10px] uppercase tracking-wider text-faint">1W · 1M · 3M</span>}
        />
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-line px-6 text-center"
          style={{ height: 380 }}
        >
          <span className="text-[12.5px] text-faint">Historical portfolio data unavailable</span>
          <span className="max-w-md text-[10.5px] leading-relaxed text-faint">
            RECODE records live balances from the present onward — it does not reconstruct past
            portfolio values. The chart activates automatically once real balance-snapshot
            history exists for this wallet.
          </span>
        </div>
      </Panel>

      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Wallet intelligence tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-[4px] border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === t.id
                ? "border-green/40 bg-green-soft text-green"
                : "border-line bg-panel-2 text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3" role="tabpanel">
        {tab === "holdings" ? (
          <HoldingsTab balances={balances} total={total} />
        ) : null}
        {tab === "activity" ? <ActivityTab activity={activity} /> : null}
        {tab === "intelligence" ? (
          <IntelligenceTab balances={balances} activity={activity} total={total} />
        ) : null}
        {tab === "smartmoney" ? <SmartMoneyTab activity={activity} /> : null}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="bg-panel px-3.5 py-3">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`tnum mt-1 text-[13.5px] font-semibold ${tone ?? ""}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[9.5px] text-faint">{sub}</div> : null}
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

function changeToneCls(v: number | null | undefined): string {
  if (v == null) return "";
  return v >= 0 ? "text-pos" : "text-neg";
}

function HoldingsTab({
  balances,
  total,
}: {
  balances: { status: string; data: WalletBalances | null };
  total: number | null;
}) {
  if (balances.status === "connecting" || balances.status === "syncing") {
    return <p className="py-12 text-center text-[12.5px] text-faint">Fetching balances on-chain…</p>;
  }
  const b = balances.data;
  if (!b) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        Balance data unavailable — the RPC did not respond.
      </p>
    );
  }
  const rows = b.balances.slice().sort((x, y) => (y.valueUsd ?? -1) - (x.valueUsd ?? -1));
  if (rows.length === 0) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        No balances found for this address on Robinhood Chain
        {b.chainOnline ? "." : " (RPC unreachable)."}
      </p>
    );
  }
  return (
    <Panel padded={false}>
      <div className="border-b border-line px-4 py-3">
        <PanelHeader
          title="Holdings"
          sub="Live on-chain balances — native via eth_getBalance, tokens via balanceOf on every indexed verified contract"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
              <th className="px-4 py-2 font-semibold">Asset</th>
              <th className="px-3 py-2 text-right font-semibold">Balance</th>
              <th className="px-3 py-2 text-right font-semibold">Price</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-3 py-2 text-right font-semibold">Allocation</th>
              <th className="px-4 py-2 text-right font-semibold">24H</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const alloc = h.valueUsd != null && total ? (h.valueUsd / total) * 100 : null;
              return (
                <tr key={h.contract ?? "native"} className="row-hover border-b border-line-soft">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <AssetLogo symbol={h.symbol} url={h.logoUrl} size={22} />
                      <span>
                        <span className="block font-medium">{h.symbol ?? "—"}</span>
                        <span className="block truncate text-[10.5px] text-faint">
                          {h.contract ? shortHash(h.contract, 6, 4) : "native"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{h.amount != null ? fmtNum(h.amount) : "—"}</td>
                  <td className="tnum px-3 py-2.5 text-right text-muted">
                    {h.priceUsd != null ? fmtPrice(h.priceUsd) : "Price unavailable"}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right font-medium">{fmtUsd(h.valueUsd)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-muted">
                    {alloc != null ? `${alloc.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`tnum px-4 py-2.5 text-right ${changeToneCls(h.change24hPct)}`}>
                    {h.change24hPct != null ? fmtPct(h.change24hPct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ActivityTab({ activity }: { activity: { status: string; data: WalletActivity | null } }) {
  if (activity.status === "connecting" || activity.status === "syncing") {
    return <p className="py-12 text-center text-[12.5px] text-faint">Loading transaction history…</p>;
  }
  const a = activity.data;
  if (!a) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        Activity data unavailable — the data source did not respond.
      </p>
    );
  }
  if (a.transfers.length === 0) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        No wallet activity found{a.errors.length > 0 ? ` — ${a.errors[0]}` : "."}
      </p>
    );
  }
  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <PanelHeader
          title="Recent activity"
          sub={
            a.source === "store"
              ? "Verified on-chain transfers from the engine's measured window"
              : "Verified explorer transfers"
          }
        />
        <span className="px-4 text-[10px] text-faint">source: {a.source ?? "none"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
              <th className="px-4 py-2 font-semibold">Hash</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Token</th>
              <th className="px-3 py-2 font-semibold">Counterparty</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-4 py-2 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {a.transfers.slice(0, 40).map((t) => (
              <tr
                key={`${t.txHash}-${t.direction}-${t.tokenAddress ?? ""}-${t.amount ?? ""}-${t.ts ?? ""}`}
                className="row-hover border-b border-line-soft"
              >
                <td className="tnum px-4 py-2.5">{shortHash(t.txHash, 10, 8)}</td>
                <td className="px-3 py-2.5">
                  <Tag tone={t.direction === "in" ? "pos" : t.direction === "out" ? "neg" : "neutral"}>
                    {t.direction === "in"
                      ? "RECEIVED"
                      : t.direction === "out"
                        ? "SENT"
                        : t.direction === "transfer"
                          ? "TRANSFER"
                          : "SELF"}
                  </Tag>
                </td>
                <td className="px-3 py-2.5 font-medium">{t.tokenSymbol ?? "—"}</td>
                <td className="tnum px-3 py-2.5 text-muted">
                  {t.counterparty ? shortHash(t.counterparty) : "—"}
                </td>
                <td className="tnum px-3 py-2.5 text-right">{t.amount != null ? fmtNum(t.amount) : "—"}</td>
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

function IntelligenceTab({
  balances,
  activity,
  total,
}: {
  balances: { status: string; data: WalletBalances | null };
  activity: { status: string; data: WalletActivity | null };
  total: number | null;
}) {
  const b = balances.data;
  const a = activity.data;

  if ((!b || b.balances.length === 0) && (!a || a.transfers.length === 0)) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        Insufficient data — no priced balances and no verified activity in the indexed window.
        RECODE does not invent behavioral conclusions.
      </p>
    );
  }

  /* Behavior signals — each derived from actual observed data only. */
  const signals: { kind: string; tone: "pos" | "neg" | "neutral"; detail: string }[] = [];

  if (b && b.balances.length > 0) {
    const sorted = b.balances
      .filter((h) => h.valueUsd != null && h.valueUsd > 0)
      .sort((x, y) => (y.valueUsd as number) - (x.valueUsd as number));
    if (sorted.length > 0 && total && total > 0) {
      const top = sorted[0];
      const share = ((top.valueUsd as number) / total) * 100;
      signals.push({
        kind: share >= 80 ? "CONCENTRATED HOLDINGS" : sorted.length >= 5 ? "DIVERSIFIED HOLDINGS" : "HOLDINGS PROFILE",
        tone: share >= 80 ? "neg" : "neutral",
        detail: `${top.symbol ?? "top asset"} = ${share.toFixed(1)}% of verified portfolio (${sorted.length} priced assets)`,
      });
    } else {
      signals.push({
        kind: "HOLDINGS UNPRICED",
        tone: "neutral",
        detail: "Balances exist but no verified prices — portfolio value cannot be established",
      });
    }
  }

  if (a && a.transfers.length > 0) {
    const ins = a.transfers.filter((t) => t.direction === "in").length;
    const outs = a.transfers.filter((t) => t.direction === "out").length;
    const netUsd = a.transfers.reduce((acc, t) => {
      if (t.usd == null) return acc;
      return acc + (t.direction === "in" ? t.usd : t.direction === "out" ? -t.usd : 0);
    }, 0);
    if (netUsd > 0)
      signals.push({ kind: "NET ACCUMULATION", tone: "pos", detail: `net +${fmtUsd(netUsd)} across ${ins} received / ${outs} sent (indexed window)` });
    else if (netUsd < 0)
      signals.push({ kind: "NET DISTRIBUTION", tone: "neg", detail: `net ${fmtUsd(netUsd)} across ${ins} received / ${outs} sent (indexed window)` });
    if (a.transfers.length >= 10)
      signals.push({ kind: "HIGH ACTIVITY", tone: "neutral", detail: `${a.transfers.length} verified transfers in the indexed window` });
  }

  if (signals.length === 0) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        Insufficient data
      </p>
    );
  }

  return (
    <Panel>
      <PanelHeader title="Behavior signals" sub="Derived from observed on-chain data only — never investment advice" />
      <ul className="space-y-2.5 px-4 pb-4 pt-1">
        {signals.map((s, i) => (
          <li key={`${s.kind}-${i}`} className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <Tag tone={s.tone}>{s.kind}</Tag>
            <span className="text-muted">{s.detail}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SmartMoneyTab({ activity }: { activity: { status: string; data: WalletActivity | null } }) {
  if (activity.status === "connecting" || activity.status === "syncing") {
    return <p className="py-12 text-center text-[12.5px] text-faint">Loading trading statistics…</p>;
  }
  const a = activity.data;
  if (!a || a.transfers.length === 0) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
        Insufficient verified history — ROI, win rate and holding periods require a trade
        history with cost basis that the indexed window does not contain.
      </p>
    );
  }
  const volume = a.transfers.reduce((acc, t) => acc + (t.usd ?? 0), 0);
  const buys = a.transfers.filter((t) => t.direction === "in" && t.usd != null).length;
  const sells = a.transfers.filter((t) => t.direction === "out" && t.usd != null).length;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Verified statistics" sub="Computed from the indexed activity window" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="Verified volume" v={fmtUsd(volume)} />
          <Row k="Received (buy-side)" v={fmtNum(buys)} />
          <Row k="Sent (sell-side)" v={fmtNum(sells)} />
          <Row k="Activity source" v={a.source ?? "—"} />
          <Row k="Window" v="engine's measured transfer window" />
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Performance analytics" sub="Requires cost-basis history" />
        <dl className="space-y-2 text-[12.5px]">
          <Row k="ROI" v="Insufficient verified history" />
          <Row k="Realized PnL" v="Insufficient verified history" />
          <Row k="Win rate" v="Insufficient verified history" />
          <Row k="Avg holding period" v="Insufficient verified history" />
        </dl>
        <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
          RECODE does not approximate cost basis or infer trades that are not observable in
          verified on-chain history.
        </p>
      </Panel>
    </div>
  );
}