"use client";

import Link from "next/link";
import { useTokenSnapshot } from "@/hooks/useTokenSnapshot";
import { RECODE_CONFIG } from "@/lib/recodeConfig";
import { changeTone, fmtPct, fmtPrice, fmtUsd, shortAddr } from "@/lib/format";
import { CopyButton } from "@/components/ui/states";
import { Panel } from "@/components/ui/primitives";

const CELL_KEYS = ["price", "change24hPct", "marketCap", "volume24h", "liquidity"] as const;
const CELL_LABELS: Record<(typeof CELL_KEYS)[number], string> = {
  price: "Price",
  change24hPct: "24H Change",
  marketCap: "Market Cap",
  volume24h: "24H Volume",
  liquidity: "Liquidity",
};

function Na() {
  return <span className="text-[12px] text-faint">Data unavailable</span>;
}

/** In-app $RECODE token surface — same engine-backed service as the landing card. */
export function TokenView() {
  const { envelope, ui, reload } = useTokenSnapshot(20_000);
  const d = envelope.data;

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-green/80">
          RECODE TOKEN · {RECODE_CONFIG.network.name.toUpperCase()} ({RECODE_CONFIG.network.chainId})
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">${RECODE_CONFIG.symbol}</h1>
          {ui === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-green/30 bg-green-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-green">
              <span className="live-dot" /> Live
            </span>
          ) : ui === "delayed" ? (
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Delayed
            </span>
          ) : null}
          <button type="button" onClick={reload} className="text-[11.5px] text-faint transition-colors hover:text-text">
            Refresh
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">{RECODE_CONFIG.description}.</p>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {CELL_KEYS.map((key) => {
          let val: React.ReactNode;
          if (ui === "connecting") val = <span className="text-[12px] text-faint">Loading…</span>;
          else if (!d) val = <Na />;
          else if (key === "price") val = d.price != null ? fmtPrice(d.price) : <Na />;
          else if (key === "change24hPct")
            val = d.change24hPct != null ? (
              <span className={changeTone(d.change24hPct)}>{fmtPct(d.change24hPct)}</span>
            ) : (
              <Na />
            );
          else if (key === "marketCap") val = d.marketCap != null ? fmtUsd(d.marketCap) : <Na />;
          else if (key === "volume24h") val = d.volume24h != null ? fmtUsd(d.volume24h) : <Na />;
          else val = d.liquidity != null ? fmtUsd(d.liquidity) : <Na />;
          return (
            <div key={key} className="bg-panel px-4 py-3.5">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                {CELL_LABELS[key]}
              </div>
              <div className="tnum mt-1.5 text-[15px] font-semibold text-text">{val}</div>
            </div>
          );
        })}
      </div>

      {ui === "unconfigured" || ui === "unavailable" ? (
        <Panel className="mt-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Token status</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {ui === "unconfigured"
              ? "The official RECODE token contract has not been configured yet. Once the contract is verified, set it in the central token configuration and add it to the market registry - price, market cap, volume and liquidity then flow from the same verified engine that powers every other RECODE surface."
              : envelope.message ?? "Awaiting verified market data for the token."}
          </p>
          <dl className="mt-3 space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Contract address</dt>
              <dd className="tnum font-semibold text-text">
                {RECODE_CONFIG.contractAddress ? shortAddr(RECODE_CONFIG.contractAddress, 10, 8) : "TBA"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Network</dt>
              <dd className="tnum">
                {RECODE_CONFIG.network.name} · {RECODE_CONFIG.network.chainId}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Status</dt>
              <dd className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                {RECODE_CONFIG.contractAddress ? "Configured" : "Coming soon"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] text-faint">
            All token metrics come exclusively from verified on-chain and market-data providers -
            never estimated values.
          </p>
        </Panel>
      ) : d ? (
        <Panel className="mt-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Token details</h2>
          <dl className="mt-2 space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Contract</dt>
              <dd className="flex items-center gap-2 text-right">
                <span className="tnum">{shortAddr(d.contract, 10, 8)}</span>
                <CopyButton text={d.contract} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Explorer</dt>
              <dd>
                {RECODE_CONFIG.links.explorer ? (
                  <a
                    href={`${RECODE_CONFIG.links.explorer}/token/${d.contract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green hover:underline"
                  >
                    View on explorer ↗
                  </a>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Network</dt>
              <dd className="tnum">{RECODE_CONFIG.network.name} · chain {d.chainId}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
              <dt className="text-muted">Data source</dt>
              <dd>{d.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pb-1.5">
              <dt className="text-muted">Last update</dt>
              <dd className="tnum">{new Date(d.updatedAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
            Market data is informational only, is not investment advice, and does not constitute an
            offer or solicitation. Detailed holder, whale and wallet analytics for indexed assets
            are available across the RECODE App.
          </p>
        </Panel>
      ) : null}

      <div className="mt-4">
        <Link href="/app" className="text-[12px] text-green hover:underline">
          ← Back to RECODE App
        </Link>
      </div>
    </div>
  );
}

