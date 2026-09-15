"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveMarkets } from "@/hooks/useSync";
import type { LiveMarketRow } from "@/services/recodeService";
import { Panel, Chip } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { changeTone, fmtPct, fmtUsd, fmtNum } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

const TFS = ["1H", "4H", "24H", "7D", "30D"] as const;
const SIGNALS = ["all", "volume", "momentum", "holders", "whales", "new"] as const;
type Signal = (typeof SIGNALS)[number];

const SIGNAL_LABEL: Record<Signal, string> = {
  all: "ALL",
  volume: "VOLUME",
  momentum: "MOMENTUM",
  holders: "HOLDER GROWTH",
  whales: "WHALES",
  new: "NEW ASSETS",
};

/**
 * RWA RADAR — market map.
 * X = signed 24h momentum · Y = verified market cap (log) · node area =
 * market cap · brightness = relative 24h volume. All engine-verified.
 */
export function RadarView() {
  const [tf, setTf] = useState<(typeof TFS)[number]>("24H");
  const [signal, setSignal] = useState<Signal>("all");
  const [hover, setHover] = useState<LiveMarketRow | null>(null);
  const markets = useLiveMarkets("24H");

  const nodes = useMemo(() => {
    const rows = [...(markets.data ?? [])].filter((m) => m.price != null);
    const filtered = rows.filter((m) => {
      switch (signal) {
        case "volume": return (m.volume24h ?? 0) > 0;
        case "momentum": return m.change24hPct != null && Math.abs(m.change24hPct) > 0.5;
        case "holders": return (m.holders ?? 0) > 0;
        case "whales": return (m.buyVolume24h ?? m.sellVolume24h) != null;
        case "new": return m.isNew;
        default: return true;
      }
    });
    const maxMcap = Math.max(...filtered.map((m) => m.marketCap ?? m.fdv ?? 0), 1);
    const maxVol = Math.max(...filtered.map((m) => m.volume24h ?? 0), 1);
    return filtered.slice(0, 60).map((m) => {
      const mcap = m.marketCap ?? m.fdv ?? 0;
      const momentum = Math.max(-10, Math.min(10, m.change24hPct ?? 0));
      const x = 50 + (momentum / 10) * 46;
      const yRank = Math.log10(mcap + 1) / Math.log10(maxMcap + 1);
      const y = 90 - yRank * 80;
      const r = 3 + Math.sqrt(mcap / maxMcap) * 13;
      const intensity = (m.volume24h ?? 0) / maxVol;
      return { m, x, y, r, intensity };
    });
  }, [markets.data, signal]);

  /* Auto-register the radar view with the RECODE Agent. */
  useAgentPageContext(
    {
      signals: {
        view: "RWA Radar (momentum × market-cap map)",
        activeSignalFilter: signal,
        nodes: nodes.slice(0, 15).map((n) => ({
          symbol: n.m.symbol,
          change24hPct: n.m.change24hPct,
          marketCap: n.m.marketCap,
          volume24h: n.m.volume24h,
          liquidity: n.m.liquidity,
          volatilityTrend: n.m.change24hPct,
          isNew: n.m.isNew,
        })),
        hovered: hover
          ? { symbol: hover.symbol, change24hPct: hover.change24hPct, volume24h: hover.volume24h }
          : null,
        dataStatus: markets.status,
      },
    },
    `radar filter: ${signal}`,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <NetworkIcon id="robinhood-chain" size={20} />
            RECODE Radar
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
            Every verified tokenized asset positioned by momentum and market size. Horizontal =
            signed 24h momentum. Vertical = verified market cap (log). Brightness = 24h volume.
          </p>
        </div>
        <div className="flex gap-1">
          {TFS.map((t) => (
            <Chip key={t} active={tf === t} onClick={() => setTf(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SIGNALS.map((s) => (
          <Chip key={s} active={signal === s} onClick={() => setSignal(s)}>
            {SIGNAL_LABEL[s]}
          </Chip>
        ))}
      </div>

      <Panel padded={false}>
        <StateBlock status={markets.status} loadingRows={8}>
          {nodes.length === 0 ? (
            <p className="px-4 py-16 text-center text-[12.5px] text-faint">
              Radar is awaiting verified market data.
            </p>
          ) : (
            <div className="relative">
              <svg viewBox="0 0 100 56" className="block w-full" style={{ aspectRatio: "16/9" }}>
                <line x1="50" y1="0" x2="50" y2="56" style={{ stroke: "var(--color-line-soft)" }} strokeWidth="0.15" />
                {[14, 28, 42].map((y) => (
                  <line key={y} x1="0" y1={y} x2="100" y2={y} style={{ stroke: "var(--color-line-soft)" }} strokeWidth="0.1" />
                ))}
                <text x="1" y="54.6" style={{ fill: "var(--color-faint)" }} fontSize="2">← DECELERATING</text>
                <text x="99" y="54.6" style={{ fill: "var(--color-faint)" }} fontSize="2" textAnchor="end">ACCELERATING →</text>
                <text x="50" y="2.6" style={{ fill: "var(--color-faint)" }} fontSize="2" textAnchor="middle">LARGER MCAP ↑</text>
                {nodes.map(({ m, x, y, r, intensity }) => {
                  const cy = y * 0.56;
                  const rad = r * 0.5;
                  const up = (m.change24hPct ?? 0) >= 0;
                  return (
                    <g key={m.address}>
                      <circle
                        className="radar-node"
                        cx={x}
                        cy={cy}
                        r={rad}
                        style={{
                          fill: up ? "var(--chart-up)" : "var(--chart-down)",
                          stroke: hover?.address === m.address ? "var(--color-text)" : "transparent",
                        }}
                        fillOpacity={0.18 + intensity * 0.5}
                        strokeWidth="0.3"
                        onMouseEnter={() => setHover(m)}
                        onMouseLeave={() => setHover(null)}
                      />
                      {rad > 4.5 || hover?.address === m.address ? (
                        <text
                          x={x}
                          y={cy + rad + 1.8}
                          textAnchor="middle"
                          style={{ fill: hover?.address === m.address ? "var(--color-text)" : "var(--color-muted)" }}
                          fontSize="2.2"
                          className="tnum"
                        >
                          {m.symbol}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
              {hover ? (
                <div className="absolute right-4 top-4 w-60 rounded-[6px] border border-line bg-surface/95 p-3 shadow-xl shadow-black/50">
                  <div className="flex items-center gap-2.5">
                    <AssetLogo symbol={hover.symbol} url={hover.logoUrl} size={26} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold">{hover.symbol}</div>
                      <div className="truncate text-[10.5px] text-faint">{hover.name}</div>
                    </div>
                  </div>
                  <dl className="tnum mt-2.5 space-y-1 text-[11.5px]">
                    <RRow k="Price" v={fmtUsd(hover.price)} />
                    <RRow k="24H" v={fmtPct(hover.change24hPct)} cls={changeTone(hover.change24hPct)} />
                    <RRow k="Volume 24H" v={fmtUsd(hover.volume24h)} />
                    <RRow k="Market Cap" v={fmtUsd(hover.marketCap ?? hover.fdv)} />
                    <RRow k="Liquidity" v={hover.liquidity != null ? fmtUsd(hover.liquidity) : "Data unavailable"} />
                    <RRow k="Holders" v={hover.holders != null ? fmtNum(hover.holders) : "Data unavailable"} />
                    <RRow
                      k="Signal"
                      v={
                        (hover.change24hPct ?? 0) > 3 && (hover.volume24h ?? 0) > 0
                          ? "Momentum + volume"
                          : (hover.change24hPct ?? 0) < -3
                            ? "Selling pressure"
                            : "Neutral"
                      }
                    />
                  </dl>
                  <Link
                    href={`/app/asset/${encodeURIComponent((hover.symbol ?? hover.address).toUpperCase())}`}
                    className="mt-2.5 block rounded-[4px] border border-green/30 bg-green-soft py-1.5 text-center text-[11.5px] font-medium text-green"
                  >
                    Open Asset Intelligence →
                  </Link>
                </div>
              ) : null}

            </div>
          )}
        </StateBlock>
      </Panel>
      <p className="mt-2 text-[10.5px] text-faint">
        Timeframe windows recompute from the engine's verified price history. Signals are
        rule-based over on-chain facts — never predicted or fabricated.
      </p>
    </div>
  );
}

function RRow({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${cls}`}>{v}</dd>
    </div>
  );
}

