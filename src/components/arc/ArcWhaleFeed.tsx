"use client";

import { useArcWhales } from "@/hooks/useArc";
import type { ArcWhaleEvent } from "@/services/arcService";
import { Panel } from "@/components/ui/primitives";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" || s === "syncing" || s === "connecting"
    ? (s as DataStatus)
    : "syncing";
}
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ARC WHALE FEED — large native-USDC transfers (EIP-7708 system
 * emitter). Every event carries its real transaction hash; USDC
 * face value = USD. This is also Arc's stablecoin-intelligence view.
 */
const KIND_TONE: Record<ArcWhaleEvent["kind"], string> = {
  transfer: "text-muted",
  mint: "text-pos",
  burn: "text-neg",
};

export function ArcWhaleFeed() {
  const whales = useArcWhales();
  const events = whales.data ?? [];
  const newest = events.length > 0 ? Math.max(...events.map((e) => e.observedAt)) : null;
  const inflow = events.filter((e) => e.kind !== "burn").reduce((s, e) => s + e.usd, 0);

  useAgentPageContext(
    {
      whale: {
        network: "Arc (chain 5042) — native USDC",
        eventCount: events.length,
        events: events.slice(0, 10).map((e) => ({
          kind: e.kind,
          usd: e.usd,
          from: e.from,
          to: e.to,
          txHash: e.txHash,
        })),
        dataStatus: whales.status,
      },
    },
    "arc whale activity",
  );

  return (
    <Panel>
      <PanelHeader
        title="ARC STABLECOIN / WHALE ACTIVITY — USDC
          "
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={toDataStatus(whales.status)} />
            <UpdatedAgo ts={newest} />
          </div>
        }
      />
      {events.length > 0 ? (
        <div className="flex gap-4 px-4 pb-2 text-[11.5px] text-muted">
          <span>
            Captured large transfers: <span className="text-text">{events.length}</span>
          </span>
          <span>
            Tracked volume: <span className="text-text">{fmtUsd(inflow)} USDC</span>
          </span>
        </div>
      ) : null}
      {whales.status === "loading" || whales.status === "idle" ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading Arc USDC whale activity…</div>
      ) : events.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">No large USDC transfers captured yet — the engine scans recent blocks continuously.</div>
      ) : (
        <ul className="divide-y divide-line/60">
          {events.slice(0, 60).map((e) => (
            <li key={`${e.txHash}-${e.from ?? "mint"}-${e.to ?? "burn"}`} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <div className="min-w-0">
                  <span className={`font-semibold ${KIND_TONE[e.kind]}`}>
                    {e.kind.toUpperCase()}
                  </span>
                  <span className="ml-2 font-medium">{fmtUsd(e.usd)} USDC</span>
                  <span className="ml-2 text-muted">
                    {shortHash(e.from ?? "0x0")} → {shortHash(e.to ?? "0x0")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-faint">
                  <span>{timeAgo(e.observedAt)}</span>
                  <a
                    href={`https://explorer.arc.io/tx/${e.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-green/80 hover:underline"
                  >
                    tx â†—
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-3 text-[11px] text-faint">
        Basis: Arc EIP-7708 native-USDC Transfer logs (system emitter, 18 decimals → face-value
        USDC). Every event is backed by a real transaction.
      </div>
    </Panel>
  );
}

