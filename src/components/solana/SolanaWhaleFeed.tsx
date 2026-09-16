"use client";

import Link from "next/link";
import { useSolanaWhales } from "@/hooks/useSolana";
import type { SolanaWhaleEvent } from "@/services/solanaService";
import { Panel } from "@/components/ui/primitives";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { fmtAmount, fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

/**
 * ============================================================
 * SOLANA WHALE FEED — large balance movements on tracked Solana
 * tokens, observed between largest-account snapshots (Solana
 * RPC). Kind is rule-based: paired in/out → transfer, unpaired →
 * accumulation/distribution. USD only with a verified price.
 * ============================================================
 */

const KIND_LABEL: Record<SolanaWhaleEvent["kind"], string> = {
  accumulation: "ACCUMULATION",
  distribution: "DISTRIBUTION",
  transfer: "TRANSFER",
};

const KIND_TONE: Record<SolanaWhaleEvent["kind"], string> = {
  accumulation: "text-pos",
  distribution: "text-neg",
  transfer: "text-muted",
};

export function SolanaWhaleFeed() {
  const whales = useSolanaWhales();
  const events = whales.data ?? [];
  const newest = events.length > 0 ? Math.max(...events.map((e) => e.observedAt)) : null;

  useAgentPageContext(
    {
      whale: {
        network: "Solana (mainnet-beta)",
        eventCount: events.length,
        events: events.slice(0, 10).map((e) => ({
          symbol: e.symbol,
          kind: e.kind,
          usd: e.usd,
          amount: e.amount,
          wallet: e.wallet,
          observedAt: e.observedAt,
        })),
        dataStatus: whales.status,
      },
    },
    "solana whale feed",
  );

  return (
    <Panel>
      <PanelHeader
        title="Solana whale activity"
        sub={`Large balance movements ≥ engine whale threshold · rule-based classification`}
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge
              status={whales.status === "live" ? "live" : whales.status === "unavailable" ? "unavailable" : "syncing"}
              label={whales.status === "live" ? "LIVE" : undefined}
            />
            <UpdatedAgo ts={newest} />
          </div>
        }
      />
      <StateBlock
        status={whales.status === "live" ? "live" : whales.status === "unavailable" ? "unavailable" : "syncing"}
        loadingRows={5}
        empty={
          events.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-faint">
              No whale events observed yet — the engine compares largest-account snapshots every
              cycle and records a movement only when it exceeds the verified USD threshold.
            </p>
          ) : null
        }
      >
        <ul className="divide-y divide-line-soft">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <AssetLogo symbol={e.symbol} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/app/token/${encodeURIComponent(e.mint)}`}
                    className="text-[13px] font-semibold hover:text-green"
                  >
                    {e.symbol ?? shortHash(e.mint, 4, 4)}
                  </Link>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider ${KIND_TONE[e.kind]}`}>
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="tnum text-[12.5px]">
                    {e.usd != null ? fmtUsd(Math.abs(e.usd)) : "USD unavailable"}
                  </span>
                  {e.amount != null ? (
                    <span className="tnum text-[11px] text-muted">
                      {fmtAmount(Math.abs(e.amount))} tokens
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10.5px] text-faint">
                  wallet {shortHash(e.wallet)}
                  {e.sharePctAfter != null ? ` · holds ${e.sharePctAfter.toFixed(2)}% of supply` : ""} ·{" "}
                  {e.source}
                </p>
              </div>
              <span className="tnum text-[10.5px] text-faint">{timeAgo(e.observedAt)}</span>
            </li>
          ))}
        </ul>
      </StateBlock>
    </Panel>
  );
}