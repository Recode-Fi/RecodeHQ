"use client";

import { useLiveOverview } from "@/hooks/useSync";
import { Panel, Tag } from "@/components/ui/primitives";
import { fmtUsd, fmtNum } from "@/lib/format";

/**
 * STONK Intelligence — ecosystem integration layer.
 * STONK is treated as an ecosystem/protocol integration on Robinhood Chain
 * infrastructure, NOT as an independent blockchain. Every metric below
 * activates only when a verified STONK token contract + data provider are
 * wired into the engine; until then each row honestly reports unavailability.
 */
export function StonkView() {
  const overview = useLiveOverview();

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-5">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-warn">
          ECOSYSTEM INTEGRATION · NOT A BLOCKCHAIN
        </div>
        <h1 className="text-xl font-semibold">STONK Intelligence</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Dedicated intelligence for the STONK ecosystem as it rides Robinhood Chain
          infrastructure. RECODE treats STONK as a protocol/token integration layer — not an
          independent chain. Metrics light up exclusively from verified contracts and providers.
        </p>
      </header>

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Integration status</div>
            <div className="mt-1 text-[13px] font-medium">
              Awaiting verified STONK token contract and reserve data source
            </div>
          </div>
          <Tag tone="warn">INITIALIZING</Tag>
        </div>
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[11.5px] leading-relaxed text-muted">
          To activate this page: verify the official STONK contract on Robinhood Chain, add it to
          the engine's market registry (<span className="tnum text-faint">markets.robinhood-chain.json</span> or a
          remote registry URL), and point a reserve/treasury data provider at the engine. Discovery,
          prices, holders and whale flows then flow automatically — with zero UI changes.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            STONK Health · Live when wired
          </h2>
          <dl className="space-y-2 text-[12.5px]">
            <R k="Price" v="Data unavailable" />
            <R k="Market cap" v="Data unavailable" />
            <R k="Supply" v="Data unavailable" />
            <R k="Liquidity" v="Data unavailable" />
            <R k="Holder growth" v="Data unavailable" />
            <R k="Market activity" v="Data unavailable" />
          </dl>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Treasury & Backing · Verified sources only
          </h2>
          <dl className="space-y-2 text-[12.5px]">
            <R k="Treasury" v="Data unavailable" />
            <R k="Reserve composition" v="Data unavailable" />
            <R k="Backing ratio" v="Data unavailable" />
            <R k="Staking" v="Data unavailable" />
            <R k="Vault metrics" v="Data unavailable" />
            <R k="Governance" v="Data unavailable" />
          </dl>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
            Reserve values are never invented. Each line activates when the engine receives
            provider-verified data for it.
          </p>
        </Panel>
      </div>

      <Panel className="mt-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Host network context · Robinhood Chain
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Mini k="Markets indexed" v={overview.data ? String(overview.data.marketsIndexed) : "—"} />
          <Mini k="RWA market cap" v={overview.data?.totalMarketCap != null ? fmtUsd(overview.data.totalMarketCap) : "—"} />
          <Mini k="24H volume" v={overview.data?.totalVolume24h != null ? fmtUsd(overview.data.totalVolume24h) : "—"} />
          <Mini k="Transactions today" v={overview.data?.transactionsToday != null ? fmtNum(overview.data.transactionsToday) : "—"} />
        </div>
      </Panel>
    </div>
  );
}

function R({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="tnum text-right text-faint">{v}</dd>
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">{k}</div>
      <div className="tnum mt-1 text-[14px] font-semibold">{v}</div>
    </div>
  );
}
