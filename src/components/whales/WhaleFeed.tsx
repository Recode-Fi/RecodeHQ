"use client";

import Link from "next/link";
import { useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import type { LiveWhale, WhaleFeedMeta } from "@/services/recodeService";
import { Panel, Chip, Tag } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

const KINDS = ["all", "buy", "sell", "transfer", "accumulation", "distribution"] as const;
const LEVELS = [
  { id: 0, label: "ALL" },
  { id: 10_000, label: "≥ $10K" },
  { id: 100_000, label: "≥ $100K" },
  { id: 1_000_000, label: "≥ $1M" },
];

const SOURCE_LABEL: Record<string, string> = {
  blockscout: "explorer",
  "goldsky-subgraph": "goldsky",
  "rpc-getlogs": "rpc",
  "robinhood-indexer": "indexer",
  "derived-direction": "derived",
};

function ProviderStrip({ meta }: { meta: WhaleFeedMeta | null }) {
  if (!meta) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft px-4 py-1.5 font-mono text-[9.5px] tracking-[0.12em] text-faint">
      <span className="text-muted">SOURCES</span>
      {meta.providers.map((p) => {
        const state = !p.configured ? "off" : p.ok === false ? "down" : "live";
        return (
          <span key={p.id} className="flex items-center gap-1.5">
            <span
              className={
                state === "live" ? "text-green" : state === "down" ? "text-warn" : "text-line-strong"
              }
              aria-hidden
            >
              ●
            </span>
            {p.label.toUpperCase()}
            {state === "off" ? " · NOT CONFIGURED" : state === "down" ? " · RETRYING" : ""}
          </span>
        );
      })}
      <span className="ml-auto">ENGINE · {meta.engineMode.toUpperCase()}</span>
    </div>
  );
}

function emptyMessage(kind: string, meta: WhaleFeedMeta | null): string {
  const threshold = meta ? `$${Math.round(meta.whaleThresholdUsd / 1000)}K` : "$10K";
  switch (kind) {
    case "buy":
    case "sell":
      return `No DEX-verified whale ${kind}s match these filters yet. A transfer is labeled ${kind.toUpperCase()} only when a DEX pool/router is provably on the other side — check TRANSFER for raw flows.`;
    case "accumulation":
    case "distribution":
      return `No rule-based whale ${kind} pattern in the last 24h window. Patterns derive from verified transfer direction across ≥2 events ≥ ${threshold}.`;
    default:
      return `No whale flows match these filters yet. Events appear only from verified on-chain transfers ≥ ${threshold}, indexed live from the Robinhood Chain explorer.`;
  }
}

/** Live whale activity feed — verified on-chain flows only. */
export function WhaleFeed({ compact = false }: { compact?: boolean }) {
  const whales = useSyncPolling<{ data: LiveWhale[]; meta?: WhaleFeedMeta }>(
    "/api/sync/whales",
    8_000,
  );
  const [kind, setKind] = useState<string>("all");
  const [minUsd, setMinUsd] = useState(0);

  const rows = (whales.data?.data ?? []).filter(
    (w) => (kind === "all" || w.kind === kind) && (w.usd ?? 0) >= minUsd,
  );
  const meta = whales.data?.meta ?? null;

  /* Auto-register the active whale-feed filters with the RECODE Agent. */
  useAgentPageContext(
    {
      whale: {
        kindFilter: kind,
        minUsd: minUsd || null,
        whaleThresholdUsd: meta?.whaleThresholdUsd ?? null,
        counts: meta?.counts ?? null,
        activeSources:
          meta?.providers
            ?.filter((p) => p.configured)
            .map((p) => p.id) ?? null,
        visibleRows: rows.length,
      },
    },
    kind === "all" ? undefined : `viewing ${kind} whale flows`,
  );

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {k.toUpperCase()}
          </Chip>
        ))}
        <div className="ml-auto flex gap-1.5">
          {LEVELS.map((l) => (
            <Chip key={l.id} active={minUsd === l.id} onClick={() => setMinUsd(l.id)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </div>
      <ProviderStrip meta={meta} />
      <StateBlock status={whales.status} loadingRows={8}>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] leading-relaxed text-faint">
            {emptyMessage(kind, meta)}
          </p>
        ) : (
          <ul>
            {rows.slice(0, compact ? 12 : 80).map((w) => {
              const isTrade = w.kind === "buy" || w.kind === "sell";
              const isDerived = w.source === "derived-direction";
              const txHref =
                meta?.explorerTxBase && w.hash && /^0x[0-9a-fA-F]{64}$/.test(w.hash)
                  ? `${meta.explorerTxBase}${w.hash}`
                  : null;
              return (
                <li
                  key={w.id}
                  className="row-hover flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-2.5 text-[12.5px]"
                >
                  <span title={w.basis ?? undefined} className="inline-flex">
                    <Tag
                      tone={
                        w.kind === "buy" || w.kind === "accumulation"
                          ? "pos"
                          : w.kind === "sell" || w.kind === "distribution"
                            ? "neg"
                            : "neutral"
                      }
                    >
                      {w.kind}
                    </Tag>
                  </span>
                  <span className="tnum w-24 font-semibold">{fmtUsd(w.usd)}</span>
                  <span className="text-muted">
                    {w.symbol ? (
                      <Link href={`/app/asset/${w.symbol}`} className="text-green hover:underline">
                        {w.symbol}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  {w.wallet ? (
                    <Link
                      href={`/app/wallet/${w.wallet}`}
                      className="tnum text-muted hover:text-text"
                    >
                      {shortHash(w.wallet)}
                    </Link>
                  ) : (
                    <span className="text-faint">unknown wallet</span>
                  )}
                  {isTrade && w.basis ? (
                    <span
                      className="cursor-help rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-muted"
                      title={w.basis}
                    >
                      DEX VERIFIED
                    </span>
                  ) : null}
                  {isDerived ? (
                    <span
                      className="cursor-help rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-muted"
                      title={w.basis ?? undefined}
                    >
                      RULE-BASED
                    </span>
                  ) : null}
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                    {w.source ? (SOURCE_LABEL[w.source] ?? w.source) : "legacy"}
                  </span>
                  {txHref ? (
                    <a
                      href={txHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-faint transition-colors hover:text-green"
                      title="View transaction on the Robinhood Chain explorer"
                    >
                      ↗
                    </a>
                  ) : null}
                  <span className="tnum ml-auto text-faint">
                    {w.tsBasis === "ingest" ? "≈ " : ""}
                    {timeAgo(w.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </StateBlock>
      {meta ? (
        <div className="px-4 py-2 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-faint">
          {meta.counts.buy} BUY · {meta.counts.sell} SELL · {meta.counts.transfer} TRANSFER ·{" "}
          {meta.counts.accumulation} ACCUMULATION · {meta.counts.distribution} DISTRIBUTION — every
          event is a real on-chain transfer observed by the sync engine
        </div>
      ) : null}
    </Panel>
  );
}



