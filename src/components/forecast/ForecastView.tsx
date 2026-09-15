"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveMarkets } from "@/hooks/useSync";
import type { LiveMarketRow } from "@/services/recodeService";
import { Panel, Tag } from "@/components/ui/primitives";
import { fmtPct } from "@/lib/format";

type Profile = "TRENDING UP" | "TRENDING DOWN" | "RANGE-BOUND";

interface TrendProfile {
  symbol: string;
  address: string;
  profile: Profile;
  momentum: number;
  rangePct: number;
  consistency: number;
  points: number;
}

const MIN_POINTS = 6;

/**
 * RECODE Forecast — descriptive trend profiles computed ONLY from verified
 * observed ticks. Describes what the data has done; never a prediction.
 */
export function ForecastView() {
  const markets = useLiveMarkets("24H");

  const profiles = useMemo<TrendProfile[]>(() => {
    const rows: LiveMarketRow[] = markets.data ?? [];
    const out: TrendProfile[] = [];
    for (const m of rows) {
      const points = m.sparkline ?? [];
      if (points.length < MIN_POINTS || points[0] <= 0) continue;
      const first = points[0];
      const last = points[points.length - 1];
      const momentum = (last / first - 1) * 100;
      const min = Math.min(...points);
      const max = Math.max(...points);
      const rangePct = min > 0 ? ((max - min) / min) * 100 : 0;
      let ups = 0;
      let steps = 0;
      for (let i = 1; i < points.length; i++) {
        steps += 1;
        if (points[i] >= points[i - 1]) ups += 1;
      }
      const consistency = steps > 0 ? ups / steps : 0;
      let profile: Profile = "RANGE-BOUND";
      if (momentum > 1 && consistency >= 0.55) profile = "TRENDING UP";
      else if (momentum < -1 && consistency <= 0.45) profile = "TRENDING DOWN";
      out.push({
        symbol: m.symbol ?? m.address,
        address: m.address,
        profile,
        momentum,
        rangePct,
        consistency,
        points: points.length,
      });
    }
    return out.sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum));
  }, [markets.data]);

  const insufficient = (markets.data ?? []).filter(
    (m) => m.price != null && (m.sparkline?.length ?? 0) < MIN_POINTS,
  );

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">RECODE Forecast</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Forward-looking analytics, honestly framed: each profile is a descriptive statistic of
          verified observed ticks (momentum, realized range, step consistency). RECODE Forecast
          does not generate price predictions.
        </p>
      </header>
      <Panel padded={false}>
        {markets.status === "connecting" || markets.status === "syncing" ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-faint">Loading verified market data…</p>
        ) : profiles.length === 0 ? (
          <p className="px-4 py-12 text-center text-[12.5px] text-faint">
            Insufficient data — no asset has enough verified observed history yet. Profiles appear
            automatically as the engine accumulates price history. Nothing is extrapolated.
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 pb-2 font-semibold">Asset</th>
                <th className="px-3 pb-2 font-semibold">Profile</th>
                <th className="px-3 pb-2 text-right font-semibold">Momentum (observed)</th>
                <th className="px-3 pb-2 text-right font-semibold">Realized range</th>
                <th className="px-3 pb-2 text-right font-semibold">Step consistency</th>
                <th className="px-4 pb-2 text-right font-semibold">Tick points</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.address} className="row-hover border-b border-line-soft">
                  <td className="px-4 py-2.5">
                    <Link href={`/app/asset/${p.symbol}`} className="font-medium text-green hover:underline">
                      {p.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Tag tone={p.profile === "TRENDING UP" ? "pos" : p.profile === "TRENDING DOWN" ? "neg" : "neutral"}>
                      {p.profile}
                    </Tag>
                  </td>
                  <td className={`tnum px-3 py-2.5 text-right ${p.momentum >= 0 ? "text-pos" : "text-neg"}`}>
                    {fmtPct(p.momentum)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-muted">{fmtPct(p.rangePct, false)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-muted">{(p.consistency * 100).toFixed(0)}%</td>
                  <td className="tnum px-4 py-2.5 text-right text-faint">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[10.5px] text-faint">
          {insufficient.length > 0
            ? `${insufficient.length} asset(s) with live prices but insufficient history are excluded as "Insufficient data".`
            : "Every profile is derived from engine-verified observed ticks only."}
        </div>
      </Panel>

      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        Methodology: momentum = first→last change of the observed window; realized range =
        (max−min)/min of observed ticks; step consistency = share of non-decreasing steps. These
        are descriptive statistics of past data — not forecasts of future prices — and never
        investment advice.
      </p>
    </div>
  );
}

