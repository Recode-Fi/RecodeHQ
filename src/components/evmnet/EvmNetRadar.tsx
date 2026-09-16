"use client";

import { useEvmNetRadar } from "@/hooks/useEvmNet";
import type { EvmNetChain, EvmNetRadarSignal } from "@/services/evmNetService";
import { Panel } from "@/components/ui/primitives";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

export const EVM_NET_NAMES: Record<EvmNetChain, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Smart Chain",
  arbitrum: "Arbitrum One",
};

const SEVERITY_TONE: Record<EvmNetRadarSignal["severity"], string> = {
  high: "text-neg",
  notable: "text-warn",
  info: "text-muted",
};

const KIND_LABEL: Record<string, string> = {
  "unusual-volume": "VOLUME",
  "price-movement": "PRICE",
  "newly-active": "NEW PAIR",
  "whale-activity": "WHALES",
  "large-transfer": "LARGE TRANSFER",
};

export function EvmNetRadar({ chain }: { chain: EvmNetChain }) {
  const radar = useEvmNetRadar(chain);
  const signals = radar.data ?? [];

  useAgentPageContext(
    {
      signals: {
        view: `${EVM_NET_NAMES[chain]} Radar`,
        count: signals.length,
        signals: signals.slice(0, 10).map((s) => ({ kind: s.kind, symbol: s.symbol, message: s.message, basis: s.basis })),
        dataStatus: radar.status,
      },
    },
    `${chain} radar`,
  );

  return (
    <Panel>
      <PanelHeader
        title={`${EVM_NET_NAMES[chain].toUpperCase()} RADAR`}
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={radar.status === "live" ? "live" : radar.status === "unavailable" ? "unavailable" : "syncing"} />
            <UpdatedAgo ts={signals[0]?.detectedAt ?? null} />
          </div>
        }
      />
      {signals.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">
          No verified {EVM_NET_NAMES[chain]} radar signals yet — signals derive from live market snapshots and stablecoin flows.
        </div>
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
                    <span className={SEVERITY_TONE[s.severity]}>●</span>
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