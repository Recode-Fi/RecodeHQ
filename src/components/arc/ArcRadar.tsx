"use client";

import { useArcRadar } from "@/hooks/useArc";
import type { ArcRadarSignal } from "@/services/arcService";
import { Panel } from "@/components/ui/primitives";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" || s === "syncing" || s === "connecting"
    ? (s as DataStatus)
    : "syncing";
}
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ARC RADAR — rule-based signals over verified Arc data (market
 * snapshots + EIP-7708 native-USDC transfer events). Every signal
 * carries its derivation basis; nothing is fabricated.
 */

const KIND_LABEL: Record<string, string> = {
  "unusual-volume": "VOLUME",
  "liquidity-change": "LIQUIDITY",
  "large-transfer": "LARGE TRANSFER",
  "whale-activity": "WHALES",
  "price-movement": "PRICE",
  "newly-active": "NEW PAIR",
};

const SEVERITY_TONE: Record<ArcRadarSignal["severity"], string> = {
  high: "text-neg",
  notable: "text-warn",
  info: "text-muted",
};

export function ArcRadar() {
  const radar = useArcRadar();
  const signals = radar.data ?? [];

  useAgentPageContext(
    {
      signals: {
        view: "Arc Radar (chain 5042)",
        count: signals.length,
        signals: signals.slice(0, 10).map((s) => ({
          kind: s.kind,
          symbol: s.symbol,
          message: s.message,
          basis: s.basis,
        })),
        dataStatus: radar.status,
      },
    },
    "arc radar",
  );

  return (
    <Panel>
      <PanelHeader
        title="ARC RADAR
          "
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={toDataStatus(radar.status)} />
            <UpdatedAgo ts={signals[0]?.detectedAt ?? null} />
          </div>
        }
      />
      {radar.status === "loading" || radar.status === "idle" ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading Arc radar…</div>
      ) : signals.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">No verified Arc radar signals yet — signals derive from live USDC flows and market snapshots.</div>
      ) : (
        <ul className="divide-y divide-line/60">
          {signals.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                      {KIND_LABEL[s.kind] ?? s.kind}
                    </span>
                    <span className={SEVERITY_TONE[s.severity]}>â—</span>
                    <span className="truncate font-medium">{s.message}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-faint">Basis: {s.basis}</div>
                </div>
                <span className="shrink-0 text-[11px] text-faint">{timeAgo(s.detectedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

