"use client";

/**
 * Whale intelligence panel — computed server-side from RAW holder
 * balances × verified price (never provider pre-calculated values).
 * Every value carries its source; unavailable metrics render "—"
 * with the reason. Uses the existing RECODE visual language only.
 */

import { useSyncPolling } from "@/hooks/useSync";
import { Panel, Tag } from "@/components/ui/primitives";
import { PanelHeader } from "@/components/kit/Kit";
import { fmtUsd, fmtNum, shortHash } from "@/lib/format";

export interface WhaleIntelData {
  symbol: string | null;
  address: string;
  concentration: {
    top10: number | null;
    top25: number | null;
    top50: number | null;
    coverage: { top10: number; top25: number; top50: number };
    basis: string;
  };
  largest: { address: string | null; balance: number | null; usd: number | null; usdSource: string | null }[];
  whaleExposure: { usd: number | null; count: number; thresholdUsd: number; basis: string } | null;
  flows: { inflowUsd: number; outflowUsd: number; netUsd: number; transferCount: number; basis: string } | null;
  price: { value: number | null; source: string | null };
  provenance: {
    source: string;
    provider: string;
    verified: boolean;
    confidence: number | null;
    updatedAt: number | null;
    freshness: string;
    sharePctDerived: boolean;
  };
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tnum text-right text-text">{v}</dd>
    </div>
  );
}

export function WhaleIntelPanel({
  symbol,
  address,
}: {
  symbol: string;
  address?: string | null;
}) {
  const key = symbol.toUpperCase();
  const { data, status } = useSyncPolling<WhaleIntelData>(
    address
      ? `/api/sync/whale-intel?address=${encodeURIComponent(address)}`
      : `/api/sync/whale-intel?symbol=${encodeURIComponent(key)}`,
    30_000,
  );

  if (status === "connecting" || status === "syncing") {
    return (
      <Panel>
        <PanelHeader title="Whale intelligence" />
        <p className="py-6 text-center text-[12.5px] text-faint">Computing from verified holder data…</p>
      </Panel>
    );
  }
  if (!data) {
    return (
      <Panel>
        <PanelHeader title="Whale intelligence" />
        <p className="py-6 text-center text-[12.5px] text-faint">
          No verified holder data yet — whale metrics stay empty until the primary indexer or the
          explorer returns holder rows. Values are never fabricated.
        </p>
      </Panel>
    );
  }

  const prov = data.provenance;
  const tone = prov.freshness === "live" ? "pos" : prov.freshness === "stale" ? "warn" : "neutral";

  return (
    <Panel>
      <PanelHeader
        title="Whale intelligence"
        sub={`${prov.source} · ${prov.provider}${prov.confidence != null ? ` · confidence ${Math.round(prov.confidence * 100)}%` : ""}`}
        right={<Tag tone={tone}>{prov.freshness.toUpperCase()}</Tag>}
      />
      <dl className="space-y-2 text-[12.5px]">
        <Row
          k="Whale USD exposure"
          v={data.whaleExposure?.usd != null ? fmtUsd(data.whaleExposure.usd) : "—"}
        />
        <Row k="Whales (≥ threshold)" v={data.whaleExposure ? fmtNum(data.whaleExposure.count) : "—"} />
        <Row
          k="Top-10 concentration"
          v={data.concentration.top10 != null ? `${data.concentration.top10.toFixed(2)}%` : "—"}
        />
        <Row
          k="Top-25 concentration"
          v={data.concentration.top25 != null ? `${data.concentration.top25.toFixed(2)}%` : "—"}
        />
        <Row
          k="Top-50 concentration"
          v={data.concentration.top50 != null ? `${data.concentration.top50.toFixed(2)}%` : "—"}
        />
        <Row k="Whale inflow (24h)" v={data.flows ? fmtUsd(data.flows.inflowUsd) : "—"} />
        <Row k="Whale outflow (24h)" v={data.flows ? fmtUsd(data.flows.outflowUsd) : "—"} />
        <Row
          k="Whale net flow (24h)"
          v={
            data.flows ? (
              <span className={data.flows.netUsd > 0 ? "text-pos" : data.flows.netUsd < 0 ? "text-neg" : "text-muted"}>
                {fmtUsd(data.flows.netUsd)}
              </span>
            ) : (
              "—"
            )
          }
        />
      </dl>
      {data.largest.length > 0 ? (
        <div className="mt-3 border-t border-line-soft pt-2">
          <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            Largest holders
          </div>
          <ul>
            {data.largest.slice(0, 10).map((h, i) => (
              <li
                key={`${h.address ?? "row"}-${i}`}
                className="tnum flex items-center gap-3 border-b border-line-soft py-1.5 text-[12px]"
              >
                <span className="w-4 text-faint">{i + 1}</span>
                <span className="flex-1 truncate text-muted">{h.address ? shortHash(h.address, 10, 8) : "—"}</span>
                <span className="w-24 text-right text-faint">{fmtNum(h.balance)}</span>
                <span className="w-24 text-right" title={h.usdSource ?? "USD unavailable"}>
                  {h.usd != null ? fmtUsd(h.usd) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
        Whale USD = verified holder balance × verified token price — computed internally, never
        provider-supplied. {data.concentration.basis}. {data.flows?.basis ?? "Flows: no verified whale-size transfers in the window."}
        {prov.sharePctDerived ? " Share percentages derived from verified total supply." : ""}
      </p>
    </Panel>
  );
}