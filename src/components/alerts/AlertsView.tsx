"use client";

import { useEffect, useState } from "react";
import { useLiveMarkets } from "@/hooks/useSync";
import { alertService, type CreateAlertInput } from "@/services/alertService";
import type { RecodeAlert, AlertMetric } from "@/lib/types";
import { Panel, Tag, Chip } from "@/components/ui/primitives";
import { fmtUsd, fmtPct, timeAgo } from "@/lib/format";

const METRICS: { key: AlertMetric; label: string; unit: string }[] = [
  { key: "price", label: "Price", unit: "USD" },
  { key: "volume", label: "Volume 24H", unit: "USD" },
  { key: "liquidity", label: "Liquidity", unit: "USD" },
  { key: "holder-growth", label: "Holder growth", unit: "%" },
  { key: "whale-activity", label: "Whale net flow", unit: "USD" },
  { key: "smart-money", label: "Smart money buys", unit: "USD" },
];

/**
 * Alert engine — local evaluation layer. Alerts evaluate in-browser
 * against live engine data while the app is open; no backend alert
 * infrastructure is pretended.
 */
export function AlertsView() {
  const markets = useLiveMarkets("24H");
  const [alerts, setAlerts] = useState<RecodeAlert[]>([]);
  const [tab, setTab] = useState<"active" | "triggered">("active");
  const [asset, setAsset] = useState("");
  const [metric, setMetric] = useState<AlertMetric>("price");
  const [condition, setCondition] = useState<"above" | "below" | "change-pct">("above");
  const [threshold, setThreshold] = useState("");

  const refresh = () => setAlerts(alertService.list());
  useEffect(refresh, []);

  // evaluate armed alerts against the live snapshot on every markets poll
  useEffect(() => {
    const rows = markets.data ?? [];
    if (rows.length === 0) return;
    const snap = new Map<string, { price?: number | null; volume24h?: number | null; liquidity?: number | null; holderGrowth?: number | null; whaleNetUsd?: number | null }>();
    for (const m of rows) {
      if (!m.symbol) continue;
      snap.set(m.symbol.toUpperCase(), {
        price: m.price,
        volume24h: m.volume24h,
        liquidity: m.liquidity,
        holderGrowth: null,
        whaleNetUsd: null,
      });
    }
    alertService.evaluate(snap);
    refresh();
  }, [markets.data]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const th = Number(threshold);
    if (!asset || !Number.isFinite(th)) return;
    const input: CreateAlertInput = { asset: asset.toUpperCase(), metric, condition, threshold: th };
    alertService.create(input);
    setThreshold("");
    refresh();
  };

  const visible = alerts.filter((a) => (tab === "active" ? a.status !== "triggered" : a.status === "triggered"));
  const unit = METRICS.find((m) => m.key === metric)?.unit ?? "";
  const fmtValue = (v: number) => (unit === "%" ? fmtPct(v) : fmtUsd(v));

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Condition alerts evaluated locally in your browser against live engine data while the
          app is open. Push delivery requires backend infrastructure and is not simulated.
        </p>
      </header>
      <Panel>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">New alert</h2>
        <form onSubmit={create} className="flex flex-wrap items-center gap-2">
          <select value={asset} onChange={(e) => setAsset(e.target.value)} className="h-9 rounded-[4px] border border-line bg-panel-2 px-2 text-[12px] outline-none">
            <option value="">Select asset…</option>
            {(markets.data ?? []).map((m) =>
              m.symbol ? (
                <option key={m.address} value={m.symbol}>
                  {m.symbol}
                </option>
              ) : null,
            )}
          </select>
          <select value={metric} onChange={(e) => setMetric(e.target.value as AlertMetric)} className="h-9 rounded-[4px] border border-line bg-panel-2 px-2 text-[12px] outline-none">
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="h-9 rounded-[4px] border border-line bg-panel-2 px-2 text-[12px] outline-none">
            <option value="above">≥</option>
            <option value="below">≤</option>
            {metric === "volume" ? <option value="change-pct">spike +% vs baseline</option> : null}
          </select>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            type="number"
            step="any"
            placeholder={unit === "%" ? "20" : "1000"}
            className="tnum h-9 w-28 rounded-[4px] border border-line bg-panel-2 px-2 text-[12px] outline-none"
          />
          <button
            type="submit"
            disabled={!asset || !threshold}
            className="h-9 rounded-[4px] btn-accent px-4 text-[12px] font-semibold text-green disabled:opacity-50"
          >
            Arm alert
          </button>
        </form>
      </Panel>

      <div className="mt-4 flex gap-1">
        <Chip active={tab === "active"} onClick={() => setTab("active")}>
          ACTIVE
        </Chip>
        <Chip active={tab === "triggered"} onClick={() => setTab("triggered")}>
          TRIGGERED
        </Chip>
      </div>

      <Panel className="mt-2" padded={false}>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-faint">
            {tab === "active" ? "No armed alerts yet." : "No triggered alerts yet — they land here the moment a condition hits."}
          </p>
        ) : (
          <ul>
            {visible.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 text-[12.5px]">
                <Tag tone={a.status === "triggered" ? "pos" : a.feedStatus === "live" ? "green" : "neutral"}>
                  {a.status === "triggered" ? "TRIGGERED" : a.feedStatus === "live" ? "ARMED · LIVE" : "ARMED · AWAITING DATA"}
                </Tag>
                <span className="tnum min-w-0 flex-1">
                  <span className="font-medium">{a.asset}</span> · {METRICS.find((m) => m.key === a.metric)?.label}{" "}
                  {a.condition === "above" ? "≥" : a.condition === "below" ? "≤" : "spike +"} {fmtValue(a.threshold)}
                  {a.status === "triggered" && a.triggeredValue != null ? ` · hit at ${fmtValue(a.triggeredValue)}` : ""}
                </span>
                <span className="tnum text-faint">
                  {a.status === "triggered" && a.triggeredAt ? timeAgo(a.triggeredAt) : `armed ${timeAgo(a.createdAt)}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    alertService.remove(a.id);
                    refresh();
                  }}
                  className="text-[11px] text-faint hover:text-neg"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-[10.5px] text-faint">
        Whale / holder-growth / smart-money alerts stay AWAITING DATA until the indexer feeds
        those metrics for the selected asset — they never fire on guesses.
      </p>
    </div>
  );
}

