"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSolanaRadar } from "@/hooks/useSolana";
import { useSolanaMarkets } from "@/hooks/useSolana";
import type { LiveSolanaRow, SolanaRadarSignal } from "@/services/solanaService";
import { Panel, Chip } from "@/components/ui/primitives";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { changeTone, fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ============================================================
 * SOLANA RADAR — rule-based signals over verified Solana data:
 * unusual volume, liquidity changes, large transfers/whale
 * activity, significant price movement, newly active pairs.
 * Every signal carries its derivation basis; nothing fabricated.
 * ============================================================
 */

const KINDS = [
  { id: "all", label: "ALL" },
  { id: "unusual-volume", label: "VOLUME" },
  { id: "liquidity-change", label: "LIQUIDITY" },
  { id: "large-transfer", label: "LARGE TRANSFERS" },
  { id: "whale-activity", label: "WHALES" },
  { id: "price-movement", label: "PRICE" },
  { id: "newly-active", label: "NEW PAIRS" },
] as const;

const SEVERITY_TONE: Record<SolanaRadarSignal["severity"], string> = {
  high: "text-neg",
  notable: "text-warn",
  info: "text-muted",
};

export function SolanaRadar() {
  const radar = useSolanaRadar();
  const markets = useSolanaMarkets();

  const byMint = useMemo(() => {
    const map = new Map<string, LiveSolanaRow>();
    for (const r of markets.data ?? []) map.set(r.mint, r);
    return map;
  }, [markets.data]);

  const signals = useMemo(() => radar.data ?? [], [radar.data]);

  useAgentPageContext(
    {
      signals: {
        view: "Solana Radar (rule-based signals)",
        activeSignalFilter: "all",
        signals: signals.slice(0, 15).map((s) => ({
          kind: s.kind,
          label: s.label,
          symbol: s.symbol,
          basis: s.basis,
          severity: s.severity,
        })),
        dataStatus: radar.status,
      },
    },
    "solana radar",
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <NetworkIcon id="solana" size={20} />
            RECODE Radar · Solana
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
            Rule-based detection of significant Solana activity — every signal shows the verified
            numbers it was derived from. Unavailable data produces no signal, never a guess.
          </p>
        </div>
        <LiveStatusBadge
          status={radar.status === "live" ? "live" : radar.status === "unavailable" ? "unavailable" : "syncing"}
          label={radar.status === "live" ? "LIVE" : undefined}
        />
      </header>

      <Panel>
        <PanelHeader
          title="Signal feed"
          sub={`${signals.length} active signals`}
          right={
            <div className="hidden gap-1.5 lg:flex">
              {KINDS.map((k) => (
                <Chip key={k.id} onClick={() => undefined}>
                  {k.label}
                </Chip>
              ))}
            </div>
          }
        />
        <StateBlock
          status={radar.status === "live" ? "live" : radar.status === "unavailable" ? "unavailable" : "syncing"}
          loadingRows={5}
          empty={
            <p className="py-10 text-center text-[12.5px] text-faint">
              No Solana signals detected yet — the radar needs at least one tracked market cycle of
              verified data before it can derive anything.
            </p>
          }
        >
          <ul className="divide-y divide-line-soft">
            {signals.map((s) => {
              const row = byMint.get(s.mint);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <AssetLogo symbol={s.symbol} url={row?.logoUrl} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/token/${encodeURIComponent(s.mint)}`}
                        className="text-[13px] font-semibold hover:text-green"
                      >
                        {s.label}
                      </Link>
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${SEVERITY_TONE[s.severity]}`}>
                        {s.kind}
                      </span>
                      {row?.change24hPct != null ? (
                        <span className={`tnum text-[11.5px] ${changeTone(row.change24hPct)}`}>
                          {fmtPct(row.change24hPct)} 24H
                        </span>
                      ) : null}
                      {row?.volume24h != null ? (
                        <span className="tnum text-[11.5px] text-muted">vol {fmtUsd(row.volume24h)}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-faint">{s.basis}</p>
                  </div>
                  <span className="tnum text-[10.5px] text-faint">{timeAgo(s.detectedAt)}</span>
                </li>
              );
            })}
          </ul>
        </StateBlock>
      </Panel>
      <p className="mt-2 text-[10.5px] text-faint">
        Solana Radar signals are computed server-side from verified stored data (DEX market
        history + largest-account balance deltas). Rule-based — never predicted or fabricated.
      </p>
    </div>
  );
}