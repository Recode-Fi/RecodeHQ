"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveMarkets, useSyncPolling } from "@/hooks/useSync";
import type { LiveMarketRow, LiveWhale } from "@/services/recodeService";
import { Panel, Tag } from "@/components/ui/primitives";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { fmtUsd, fmtPct, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

type Tone = "pos" | "neg" | "warn" | "neutral";

interface Signal {
  id: string;
  kind: string;
  tone: Tone;
  symbol: string | null;
  address?: string;
  detail: string;
  ts?: number;
}

const WHALE_NET_THRESHOLD = 10_000;

/**
 * RECODE Signals — rule-based detection over verified engine data.
 * RAW DATA → ANALYSIS → SIGNAL. Every signal cites its underlying metric;
 * nothing is predicted and nothing is fabricated. No signals → empty state.
 */
export function SignalsView() {
  const markets = useLiveMarkets("24H");
  const whales = useSyncPolling<LiveWhale[]>("/api/sync/whales", 10_000);

  const signals = useMemo<Signal[]>(() => {
    const rows = markets.data ?? [];
    const out: Signal[] = [];

    // Momentum signals — verified 24h price change with real volume behind it
    for (const m of rows) {
      const c = m.change24hPct;
      if (c == null || (m.volume24h ?? 0) <= 0) continue;
      if (c >= 3) {
        out.push({
          id: `mom-${m.address}`,
          kind: "UPWARD MOMENTUM",
          tone: "pos",
          symbol: m.symbol,
          address: m.address,
          detail: `${fmtPct(c)} in 24h on ${fmtUsd(m.volume24h)} verified volume`,
        });
      } else if (c <= -3) {
        out.push({
          id: `mom-${m.address}`,
          kind: "DOWNWARD MOMENTUM",
          tone: "neg",
          symbol: m.symbol,
          address: m.address,
          detail: `${fmtPct(c)} in 24h on ${fmtUsd(m.volume24h)} verified volume`,
        });
      }
    }

    // Whale flows — net accumulation vs distribution per asset (24h window)
    const cutoff = Date.now() - 86_400_000;
    const byAsset = new Map<string, { net: number; symbol: string | null; address: string | null; last: number }>();
    for (const w of whales.data ?? []) {
      if (w.ts < cutoff || w.usd == null || !w.address) continue;
      const e = byAsset.get(w.address) ?? { net: 0, symbol: w.symbol, address: w.address, last: 0 };
      if (w.kind === "buy" || w.kind === "accumulation") e.net += w.usd;
      else if (w.kind === "sell" || w.kind === "distribution") e.net -= w.usd;
      e.last = Math.max(e.last, w.ts);
      byAsset.set(w.address, e);
    }
    for (const [address, e] of byAsset) {
      if (Math.abs(e.net) < WHALE_NET_THRESHOLD) continue;
      out.push({
        id: `whale-${address}`,
        kind: e.net > 0 ? "WHALE ACCUMULATION" : "WHALE DISTRIBUTION",
        tone: e.net > 0 ? "pos" : "neg",
        symbol: e.symbol,
        address,
        detail: `${fmtUsd(Math.abs(e.net))} net on-chain flow (24h)`,
        ts: e.last,
      });
    }

    // New listings — assets discovered by the engine within 24h
    for (const m of rows) {
      if (!m.isNew) continue;
      out.push({
        id: `new-${m.address}`,
        kind: "NEW LISTING",
        tone: "warn",
        symbol: m.symbol,
        address: m.address,
        detail: "First indexed by the engine within the last 24h",
        ts: m.firstSeen,
      });
    }

    // Volume leaders — top verified 24h turnover
    const leaders = [...rows]
      .filter((m: LiveMarketRow) => (m.volume24h ?? 0) > 0)
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, 3);
    for (const m of leaders) {
      out.push({
        id: `vol-${m.address}`,
        kind: "VOLUME LEADER",
        tone: "neutral",
        symbol: m.symbol,
        address: m.address,
        detail: `${fmtUsd(m.volume24h)} verified 24h turnover`,
      });
    }

    return out;
  }, [markets.data, whales.data]);

  /* Auto-register the live signals with the RECODE Agent. */
  useAgentPageContext({
    signals: {
      view: "RECODE Signals (rule-based, verified data only)",
      activeSignals: signals.slice(0, 12).map((s) => ({
        kind: s.kind,
        symbol: s.symbol,
        detail: s.detail,
      })),
      signalCount: signals.length,
      marketCount: markets.data?.length ?? 0,
      dataStatus: markets.status,
    },
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">RECODE Signals</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Detection of unusual activity, momentum, whale flows and new listings — every signal is
          a rule applied to verified on-chain data, with its underlying metric cited. Signals are
          observations, not predictions, and never investment advice.
        </p>
      </header>

      {signals.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-line px-6 py-14 text-center text-[12.5px] text-faint">
          No signals from verified data in the current window. RECODE never fabricates activity —
          cards appear here as soon as the engine's verified feeds produce qualifying events.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {signals.map((s) => (
            <Panel key={s.id} className="flex items-start gap-3">
              <AssetLogo symbol={s.symbol} url={null} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={s.tone}>{s.kind}</Tag>
                  {s.symbol ? (
                    <Link href={`/app/asset/${s.symbol}`} className="text-[13px] font-semibold text-green hover:underline">
                      {s.symbol}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-faint">unknown asset</span>
                  )}
                  {s.ts ? <span className="tnum ml-auto text-[10.5px] text-faint">{timeAgo(s.ts)}</span> : null}
                </div>
                <p className="tnum mt-1 text-[11.5px] text-muted">{s.detail}</p>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
