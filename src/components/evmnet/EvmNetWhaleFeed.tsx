"use client";

import { useEvmNetWhales } from "@/hooks/useEvmNet";
import type { EvmNetChain, EvmNetWhaleEvent } from "@/services/evmNetService";
import { Panel } from "@/components/ui/primitives";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { EVM_NET_NAMES } from "./EvmNetRadar";

const EXPLORERS: Record<EvmNetChain, string> = {
  ethereum: "https://etherscan.io",
  bsc: "https://bscscan.com",
  arbitrum: "https://arbiscan.io",
};

const KIND_TONE: Record<EvmNetWhaleEvent["kind"], string> = {
  transfer: "text-muted",
  mint: "text-pos",
  burn: "text-neg",
};

export function EvmNetWhaleFeed({ chain }: { chain: EvmNetChain }) {
  const whales = useEvmNetWhales(chain);
  const events = whales.data ?? [];
  const newest = events.length > 0 ? Math.max(...events.map((e) => e.observedAt)) : null;

  useAgentPageContext(
    {
      whale: {
        network: `${EVM_NET_NAMES[chain]} — canonical stablecoin flows`,
        eventCount: events.length,
        events: events.slice(0, 10).map((e) => ({ kind: e.kind, symbol: e.symbol, usd: e.usd, from: e.from, to: e.to, txHash: e.txHash })),
        dataStatus: whales.status,
      },
    },
    `${chain} whale activity`,
  );

  return (
    <Panel>
      <PanelHeader
        title={`${EVM_NET_NAMES[chain].toUpperCase()} WHALE ACTIVITY`}
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={whales.status === "live" ? "live" : whales.status === "unavailable" ? "unavailable" : "syncing"} />
            <UpdatedAgo ts={newest} />
          </div>
        }
      />
      {whales.status === "live" || whales.status === "stale" ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading {EVM_NET_NAMES[chain]} whale activity…</div>
      ) : events.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">
          No large stablecoin transfers captured yet — the engine scans recent blocks continuously.
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {events.slice(0, 60).map((e, i) => (
            <li key={`${e.txHash}-${e.from ?? "mint"}-${e.to ?? "burn"}-${i}`} className="flex items-center justify-between px-4 py-3 text-[12.5px]">
              <div className="min-w-0">
                <span className={`font-semibold ${KIND_TONE[e.kind]}`}>{e.kind.toUpperCase()}</span>
                <span className="ml-2 font-medium">{fmtUsd(e.usd)} {e.symbol}</span>
                <span className="ml-2 text-muted">
                  {shortHash(e.from ?? "0x0")} → {shortHash(e.to ?? "0x0")}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-faint">
                <span>{timeAgo(e.observedAt)}</span>
                <a href={`${EXPLORERS[chain]}/tx/${e.txHash}`} target="_blank" rel="noreferrer" className="text-green/80 hover:underline">
                  tx ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-3 text-[11px] text-faint">
        Basis: canonical-stablecoin Transfer logs on {EVM_NET_NAMES[chain]} — every event is backed by a real transaction; USD is the stablecoin face value.
      </div>
    </Panel>
  );
}