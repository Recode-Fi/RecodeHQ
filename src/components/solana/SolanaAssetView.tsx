"use client";

import { useSolanaToken } from "@/hooks/useSolana";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { NetworkIcon } from "@/components/ui/NetworkIcon";
import { Sparkline } from "@/components/charts/Sparkline";
import { Panel, Tag, Chip } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/states";
import { PanelHeader, StatStrip, StateBlock } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { fmtUsd, fmtNum, fmtAmount, fmtPct, shortHash, timeAgo, changeTone } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

/**
 * ============================================================
 * SOLANA ASSET INTELLIGENCE — one mint address (base58, never an
 * EVM contract). Verified market state, holder concentration,
 * recent whale movements and pair metadata from the Solana
 * intelligence layer. Unavailable fields render honest states.
 * ============================================================
 */
export function SolanaAssetView({ mint }: { mint: string }) {
  const { data, status } = useSolanaToken(mint);
  const t = data?.token;

  useAgentPageContext(
    {
      asset: {
        network: "Solana (mainnet-beta)",
        mint,
        symbol: t?.symbol ?? null,
        name: t?.name ?? null,
        price: t?.priceUsd ?? null,
        change24hPct: t?.change24hPct ?? null,
        volume24h: t?.volume24hUsd ?? null,
        liquidity: t?.liquidityUsd ?? null,
        marketCap: t?.marketCap ?? null,
        dexId: t?.dexId ?? null,
        pairAddress: t?.pairAddress ?? null,
        top10Concentration: data?.concentration.top10 ?? null,
        dataStatus: status,
      },
    },
    "solana token detail",
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AssetLogo symbol={t?.symbol} url={t?.logoUrl} size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{t?.symbol ?? shortHash(mint, 6, 6)}</h1>
              <Tag>
                <span className="inline-flex items-center gap-1.5">
                  <NetworkIcon id="solana" size={12} />
                  Solana
                </span>
              </Tag>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{t?.name ?? "Solana token"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusBadge
            status={status === "live" ? "live" : status === "unavailable" ? "unavailable" : "syncing"}
            label={status === "live" ? "LIVE" : undefined}
          />
          <UpdatedAgo ts={t?.updatedAt && t.updatedAt > 0 ? t.updatedAt : null} />
        </div>
      </header>

      <StateBlock
        status={status === "live" || status === "stale" ? "live" : status === "unavailable" ? "unavailable" : "syncing"}
        loadingRows={6}
        empty={null}
      >
        {t ? (
          <>
            <StatStrip
              stats={[
                { label: "Price", value: fmtUsd(t.priceUsd) },
                {
                  label: "24H",
                  value: fmtPct(t.change24hPct),
                  sub: <span className={changeTone(t.change24hPct)}>{fmtPct(t.change24hPct)}</span>,
                },
                { label: "Market Cap", value: t.marketCap != null ? fmtUsd(t.marketCap) : "Data unavailable" },
                { label: "Liquidity", value: t.liquidityUsd != null ? fmtUsd(t.liquidityUsd) : "Data unavailable" },
                { label: "Volume 24H", value: t.volume24hUsd != null ? fmtUsd(t.volume24hUsd) : "Data unavailable" },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <PanelHeader title="Market data" sub={data?.priceBasis ?? "Verified DEX market data"} />
                <dl className="tnum space-y-2 text-[12.5px]">
                  <Row k="Price" v={fmtUsd(t.priceUsd)} />
                  <Row k="24H change" v={fmtPct(t.change24hPct)} cls={changeTone(t.change24hPct)} />
                  <Row k="Market cap" v={t.marketCap != null ? fmtUsd(t.marketCap) : "—"} />
                  <Row k="FDV" v={t.fdv != null ? fmtUsd(t.fdv) : "—"} />
                  <Row k="Liquidity" v={t.liquidityUsd != null ? fmtUsd(t.liquidityUsd) : "—"} />
                  <Row
                    k="Volume 24H / 6H / 1H"
                    v={
                      t.volume24hUsd != null
                        ? `${fmtUsd(t.volume24hUsd)} / ${t.volume6hUsd != null ? fmtUsd(t.volume6hUsd) : "—"} / ${t.volume1hUsd != null ? fmtUsd(t.volume1hUsd) : "—"}`
                        : "—"
                    }
                  />
                  <Row
                    k="Trading activity 24H"
                    v={
                      t.buys24h != null && t.sells24h != null
                        ? `${fmtNum(t.buys24h)} buys / ${fmtNum(t.sells24h)} sells`
                        : "Data unavailable"
                    }
                  />
                  <Row k="Supply" v={t.supply != null ? fmtAmount(t.supply) : "—"} />
                  <Row k="DEX" v={t.dexId ?? "—"} />
                  <Row k="Pair" v={t.pairAddress ? shortHash(t.pairAddress, 6, 6) : "—"} />
                  <Row k="Pair created" v={t.pairCreatedAt != null ? timeAgo(t.pairCreatedAt) : "—"} />
                </dl>
                {data && data.sparkline.length > 1 ? (
                  <div className="mt-3">
                    <Sparkline points={data.sparkline} width={560} height={60} />
                  </div>
                ) : null}
              </Panel>

              <Panel>
                <PanelHeader
                  title="Holder concentration"
                  sub={data?.holders ? `Largest accounts · ${timeAgo(data.holders.updatedAt)}` : "Solana RPC largest accounts"}
                />
                {data?.holders && data.holders.top.length > 0 ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Chip>Top-10: {data.concentration.top10 != null ? `${data.concentration.top10.toFixed(1)}%` : "—"}</Chip>
                      <Chip>Supply: {data.holders.supply != null ? fmtAmount(data.holders.supply) : "—"}</Chip>
                    </div>
                    <ul className="tnum space-y-1.5 text-[12px]">
                      {data.holders.top.slice(0, 10).map((h) => (
                        <li key={h.tokenAccount} className="flex items-center justify-between gap-3">
                          <span className="text-muted">{shortHash(h.address ?? h.tokenAccount)}</span>
                          <span className="flex items-center gap-3">
                            <span>{h.sharePct != null ? `${h.sharePct.toFixed(2)}%` : "—"}</span>
                            <span className="w-20 text-right">{h.usd != null ? fmtUsd(h.usd) : "—"}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="py-8 text-center text-[12px] text-faint">
                    Holder data unavailable — Solana RPC rate limits or the mint has not been
                    scanned yet. RECODE never estimates holder counts.
                  </p>
                )}
                {data && data.whales.length > 0 ? (
                  <div className="mt-4 border-t border-line-soft pt-3">
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Recent whale movements
                    </h3>
                    <ul className="tnum space-y-1.5 text-[12px]">
                      {data.whales.slice(0, 6).map((w) => (
                        <li key={w.id} className="flex items-center justify-between gap-3">
                          <span className={w.kind === "accumulation" ? "text-pos" : w.kind === "distribution" ? "text-neg" : "text-muted"}>
                            {w.kind.toUpperCase()}
                          </span>
                          <span className="flex gap-3">
                            <span>{w.usd != null ? fmtUsd(Math.abs(w.usd)) : "—"}</span>
                            <span className="text-faint">{timeAgo(w.observedAt)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Panel>
            </div>

            <Panel>
              <PanelHeader title="Mint address" sub="Base58 SPL mint — processed via Solana RPC, never as an EVM contract" />
              <div className="flex flex-wrap items-center gap-2">
                <code className="tnum break-all rounded-[4px] border border-line bg-panel px-2.5 py-1.5 text-[11.5px]">
                  {mint}
                </code>
                <CopyButton text={mint} />
                <a
                  href={`https://solscan.io/token/${mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] text-green hover:underline"
                >
                  View on Solscan ↗
                </a>
                {t.pairAddress ? (
                  <a
                    href={`https://solscan.io/account/${t.pairAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11.5px] text-green hover:underline"
                  >
                    View pair ↗
                  </a>
                ) : null}
              </div>
            </Panel>
          </>
        ) : null}
      </StateBlock>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${cls}`}>{v}</dd>
    </div>
  );
}