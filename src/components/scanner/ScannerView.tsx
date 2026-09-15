"use client";

import { useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import type { ScanResult } from "@/server/sync/services/scanService";
import { Panel, Tag } from "@/components/ui/primitives";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { fmtNum, fmtUsd, fmtPct, fmtDate, fmtPrice, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";

const RISK_TONE = { LOW: "pos", MEDIUM: "warn", HIGH: "neg", UNKNOWN: "neutral" } as const;

const TYPE_LABEL: Record<string, string> = {
  erc20: "ERC-20 Token",
  erc721: "ERC-721 (NFT) Contract",
  proxy: "Proxy Contract",
  contract: "Smart Contract",
  eoa: "Wallet Address (EOA)",
  unknown: "Unknown",
};

const CAP_TONE = { DETECTED: "warn", "NOT DETECTED": "pos", UNKNOWN: "neutral" } as const;
const FRESH_TONE = { live: "pos", stale: "warn", unavailable: "neutral" } as const;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/** Panel classification label — the four data classes are never mixed. */
function ClassTag({ kind }: { kind: "LIVE ON-CHAIN" | "LIVE MARKET" | "CALCULATED" | "UNKNOWN" }) {
  const tone =
    kind === "LIVE ON-CHAIN" || kind === "LIVE MARKET" ? "green" : kind === "CALCULATED" ? "neutral" : "warn";
  return <Tag tone={tone}>{kind}</Tag>;
}

function NA({ reason }: { reason?: string }) {
  return (
    <span className="text-faint" title={reason}>
      —{reason ? "" : ""}
    </span>
  );
}

/**
 * RECODE Scan — Robinhood Chain contract & token intelligence scanner.
 * One server-side aggregation per address (/api/scan/[address]): live
 * RPC reads, verified market quotes, indexer-first holder intelligence,
 * internally-computed whale USD and measured transfer activity. Data
 * classes are labeled; unavailable metrics render "—"/UNKNOWN with a
 * reason — never zeros, never estimates.
 */
export function ScannerView({ initial }: { initial?: string }) {
  const [input, setInput] = useState(initial ?? "");
  const [invalid, setInvalid] = useState(false);
  const [address, setAddress] = useState<string | null>(
    initial && ADDR_RE.test(initial) ? initial.toLowerCase() : null,
  );
  const scan = useSyncPolling<ScanResult>(
    address ? `/api/scan/${encodeURIComponent(address)}` : "/api/scan/0x0000000000000000000000000000000000000000",
    15_000,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim().toLowerCase();
    if (!ADDR_RE.test(v)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setAddress(v);
  };

  const d = address ? scan.data : null;
  const mk = d?.market ?? null;
  const val = d?.valuation ?? null;

  /* Auto-register the scan result with the RECODE Agent. */
  useAgentPageContext(
    d
      ? {
          contract: {
            address: d.address,
            tokenName: d.token?.name ?? null,
            symbol: d.token?.symbol ?? null,
            decimals: d.token?.decimals ?? null,
            totalSupply: d.token?.totalSupply ?? null,
            contractType: d.contract?.contractType ?? null,
            isVerified: d.contract?.isVerified ?? null,
            isProxy: d.contract?.isProxy ?? null,
            implementation: d.contract?.implementation ?? null,
            owner: d.contract?.owner ?? null,
            adminAddress: d.contract?.adminAddress ?? null,
            creator: d.contract?.creator ?? null,
            deployedAt: d.contract?.deployedAt ?? null,
            ageDays: d.contract?.ageDays ?? null,
            marketCap: val?.marketCap ?? null,
            marketCapVerified: val?.marketCapVerified ?? null,
            fdv: val?.fdv ?? null,
            liquidityUsd: d.liquidity?.totalUsd ?? null,
            holdersTotal: d.holders?.total ?? null,
          },
        }
      : null,
    address ? `scanning ${address}` : "no contract scanned yet",
  );

  return (
    <div className="mx-auto max-w-[1060px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">RECODE Scan</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Paste any contract address on Robinhood Chain. RECODE reads the contract on-chain,
          detects its type, inspects proxy &amp; ownership, and reports verified facts with a
          conservative risk verdict — never "SAFE"; absence of evidence is UNKNOWN.
        </p>
      </header>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (invalid) setInvalid(false);
          }}
          placeholder="0x…  (contract or wallet address)"
          spellCheck={false}
          aria-invalid={invalid}
          className={`tnum h-10 w-full rounded-[4px] border bg-panel px-3.5 text-[13px] outline-none placeholder:text-faint focus:border-green/40 ${
            invalid ? "border-neg" : "border-line"
          }`}
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-[4px] btn-accent px-5 text-[12.5px] font-semibold text-green"
        >
          Scan
        </button>
      </form>
      {invalid ? (
        <p className="mt-2 text-[11.5px] text-neg">Invalid contract address</p>
      ) : null}

      
      <div className="mt-5">
        {!address ? (
          <p className="rounded-[6px] border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-faint">
            Enter a contract address to begin. Example: any verified Robinhood Chain token from
            the <a href="/app/markets" className="text-green hover:underline">Markets table</a>.
          </p>
        ) : !d ? (
          <p className="py-8 text-center text-[12.5px] text-faint">
            {scan.status === "unavailable"
              ? "Scan unavailable — the RPC or explorer did not respond. Retrying automatically…"
              : "Scanning contract on-chain — reading code, detecting type, probing interfaces…"}
          </p>
        ) : (
          <>
            {/* LIVE NETWORK STATUS — same LiveStatus components as the rest of RECODE */}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-panel px-4 py-2.5 text-[11.5px]">
              <LiveStatusBadge status={d.network.online ? (scan.status === "stale" ? "stale" : "live") : "unavailable"} />
              <span className="font-medium">Robinhood Chain</span>
              <span className="text-line">|</span>
              <span className="tnum text-muted">
                Block {d.network.blockNumber != null ? fmtNum(d.network.blockNumber) : "—"}
              </span>
              <span className="text-line">|</span>
              <span className="tnum text-muted">
                Gas{" "}
                {d.network.gasPriceGwei != null
                  ? `${d.network.gasPriceGwei < 0.01 ? d.network.gasPriceGwei.toFixed(4) : d.network.gasPriceGwei.toFixed(3)} Gwei`
                  : "—"}
              </span>
              <span className="ml-auto">
                <UpdatedAgo ts={d.updatedAt} />
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Tag tone="neutral">{TYPE_LABEL[d.contract.contractType ?? "unknown"]}</Tag>
              {d.contract.tokenStandard ? <Tag tone="neutral">{d.contract.tokenStandard}</Tag> : null}
              {d.token.known ? (
                <Tag tone="pos">Verified registry{d.token.knownSymbol ? ` · ${d.token.knownSymbol}` : ""}</Tag>
              ) : null}
              {d.contract.isProxy ? <Tag tone="warn">Proxy</Tag> : null}
              <span className="ml-auto text-[10.5px] text-faint">Robinhood Chain · 4663</span>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4 rounded-[6px] border border-line bg-panel px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Risk verdict
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed">
                  {d.security.riskFactors.length > 0
                    ? d.security.riskFactors.join(" · ")
                    : "No adverse signals in verified data"}
                </div>
              </div>
              <Tag tone={RISK_TONE[d.security.risk as keyof typeof RISK_TONE] ?? "neutral"}>
                {d.security.risk}
              </Tag>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Contract &amp; Deployment
                  </h2>
                  <ClassTag kind="LIVE ON-CHAIN" />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R k="Address" v={<span className="tnum">{shortHash(d.address, 10, 8)}</span>} />
                  <R k="On-chain state" v={d.contract.onChainState ?? <NA reason="RPC unreachable" />} />
                  <R
                    k="Contract type"
                    v={d.contract.contractType ? TYPE_LABEL[d.contract.contractType] : "UNKNOWN"}
                  />
                  <R
                    k="Bytecode size"
                    v={
                      d.contract.codeSizeBytes != null
                        ? `${fmtNum(d.contract.codeSizeBytes)} bytes`
                        : <NA reason="eth_getCode unavailable" />
                    }
                  />
                  <R
                    k="Source verified"
                    v={
                      d.contract.isVerified == null
                        ? <NA reason="Explorer unreachable — verification status cannot be established" />
                        : d.contract.isVerified
                          ? "Yes"
                          : "No"
                    }
                  />
                  <R k="Compiler" v={d.contract.compiler ?? <NA reason="Requires verified source (explorer)" />} />
                  <R
                    k="Creator"
                    v={
                      d.contract.creator ? (
                        <span className="tnum">{shortHash(d.contract.creator)}</span>
                      ) : (
                        <NA reason="Deployment info requires the explorer" />
                      )
                    }
                  />
                  <R
                    k="Deployed"
                    v={
                      d.contract.deployedAt != null ? (
                        fmtDate(d.contract.deployedAt)
                      ) : (
                        <NA reason="Deployment info requires the explorer" />
                      )
                    }
                  />
                  <R
                    k="Contract age"
                    v={d.contract.ageLabel ?? <NA reason="Deployment timestamp unavailable" />}
                  />
                </dl>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Token</h2>
                  <ClassTag kind="LIVE ON-CHAIN" />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R k="Name" v={d.token.name ?? "UNKNOWN"} />
                  <R k="Symbol" v={d.token.symbol ?? "UNKNOWN"} />
                  <R k="Decimals" v={d.token.decimals != null ? d.token.decimals : "UNKNOWN"} />
                  <R
                    k="Total supply"
                    v={
                      d.token.totalSupply != null
                        ? <span className="tnum">{fmtNum(d.token.totalSupply)}</span>
                        : <NA reason="totalSupply() probe unavailable" />
                    }
                  />
                  <R k="Metadata source" v={d.token.known ? "Verified registry + on-chain RPC" : "On-chain RPC probe"} />
                </dl>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Proxy &amp; Ownership
                  </h2>
                  <ClassTag kind="LIVE ON-CHAIN" />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R
                    k="Proxy"
                    v={
                      d.contract.isProxy == null
                        ? "UNKNOWN"
                        : d.contract.isProxy
                          ? "Proxy detected (EIP-1967)"
                          : "No proxy detected"
                    }
                  />
                  <R
                    k="Implementation"
                    v={
                      d.contract.implementation ? (
                        <span className="tnum">{shortHash(d.contract.implementation)}</span>
                      ) : d.contract.isProxy ? (
                        "UNKNOWN"
                      ) : (
                        <NA reason="Not a proxy" />
                      )
                    }
                  />
                  <R
                    k="Admin address"
                    v={
                      d.contract.adminAddress ? (
                        <span className="tnum">{shortHash(d.contract.adminAddress)}</span>
                      ) : d.contract.isProxy ? (
                        "UNKNOWN"
                      ) : (
                        <NA reason="Not a proxy" />
                      )
                    }
                  />
                  <R
                    k="owner()"
                    v={
                      d.contract.owner ? (
                        <span className="tnum">{shortHash(d.contract.owner)}</span>
                      ) : (
                        "not exposed"
                      )
                    }
                  />
                </dl>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Capabilities
                  </h2>
                  <ClassTag kind={d.security.capabilities.mintable === "UNKNOWN" ? "UNKNOWN" : "LIVE ON-CHAIN"} />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R
                    k="Mintable"
                    v={<Tag tone={CAP_TONE[d.security.capabilities.mintable]}>{d.security.capabilities.mintable}</Tag>}
                  />
                  <R
                    k="Pausable"
                    v={<Tag tone={CAP_TONE[d.security.capabilities.pausable]}>{d.security.capabilities.pausable}</Tag>}
                  />
                  <R
                    k="Blacklist"
                    v={<Tag tone={CAP_TONE[d.security.capabilities.blacklist]}>{d.security.capabilities.blacklist}</Tag>}
                  />
                  <R
                    k="Upgradeable"
                    v={<Tag tone={CAP_TONE[d.security.capabilities.upgradeable]}>{d.security.capabilities.upgradeable}</Tag>}
                  />
                </dl>
                <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
                  {d.security.capabilities.basis}
                </p>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Market data</h2>
                  <ClassTag kind={mk ? "LIVE MARKET" : "UNKNOWN"} />
                </div>
                {mk ? (
                  <dl className="space-y-2 text-[12.5px]">
                    <R
                      k="Price (mid)"
                      v={<span className="font-semibold">{fmtPrice(mk.price)}</span>}
                    />
                    <R k="Bid" v={mk.bid != null ? fmtPrice(mk.bid) : "—"} />
                    <R k="Ask" v={mk.ask != null ? fmtPrice(mk.ask) : "—"} />
                    <R k="Spread" v={mk.spreadPct != null ? `${mk.spreadPct.toFixed(2)}%` : "—"} />
                    <R
                      k="24H change"
                      v={<span className={mk.change24hPct != null && mk.change24hPct > 0 ? "text-pos" : mk.change24hPct != null && mk.change24hPct < 0 ? "text-neg" : ""}>{fmtPct(mk.change24hPct)}</span>}
                    />
                    <R k="24H high" v={mk.high24h != null ? fmtPrice(mk.high24h) : "—"} />
                    <R k="24H low" v={mk.low24h != null ? fmtPrice(mk.low24h) : "—"} />
                    <R k="24H volume" v={fmtUsd(mk.volume24h)} />
                    <R
                      k="Market status"
                      v={
                        <Tag tone={mk.tradingStatus === "HALTED" ? "neg" : mk.tradingStatus === "CLOSED" ? "neutral" : "pos"}>
                          {mk.tradingStatus ?? "UNKNOWN"}
                        </Tag>
                      }
                    />
                    <R
                      k="Quote"
                      v={
                        <span className="flex items-center justify-end gap-2">
                          <Tag tone={FRESH_TONE[mk.freshness]}>{mk.freshness.toUpperCase()}</Tag>
                          <UpdatedAgo ts={mk.updatedAt} />
                        </span>
                      }
                    />
                    <R k="Source" v={mk.source ?? "UNKNOWN"} />
                  </dl>
                ) : (
                  <p className="text-[12px] text-faint">{d.marketUnavailableReason ?? "Market data unavailable"}</p>
                )}
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Market Cap &amp; FDV
                  </h2>
                  <ClassTag kind={val && (val.marketCap != null || val.fdv != null) ? "CALCULATED" : "UNKNOWN"} />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R
                    k="Market Cap"
                    v={val?.marketCap != null ? fmtUsd(val.marketCap) : "—"}
                  />
                  <R
                    k="MCap source"
                    v={
                      val?.marketCapSource ? (
                        `${val.marketCapSource} · Verified: ${val.marketCapVerified ? "YES" : "NO"}`
                      ) : (
                        <NA reason="Circulating supply unavailable" />
                      )
                    }
                  />
                  <R k="FDV" v={val?.fdv != null ? fmtUsd(val.fdv) : "—"} />
                  <R
                    k="FDV source"
                    v={val?.fdvBasis ?? <NA reason="Needs on-chain totalSupply() and a verified price" />}
                  />
                  <R
                    k="Circulating supply"
                    v={<NA reason="Circulating supply not verified for this token" />}
                  />
                </dl>
                <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
                  Total supply is never used as circulating supply — Market Cap stays "—" unless
                  circulating is verified from an official source.
                </p>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Liquidity</h2>
                  <ClassTag kind={d.liquidity.totalUsd != null ? "LIVE ON-CHAIN" : "UNKNOWN"} />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R k="Total liquidity" v={d.liquidity.totalUsd != null ? fmtUsd(d.liquidity.totalUsd) : "—"} />
                  <R k="Pools" v={d.liquidity.pools ? fmtNum(d.liquidity.pools.length) : "—"} />
                  {d.liquidity.pools?.slice(0, 3).map((p) => (
                    <R
                      key={p.address}
                      k={p.dex ?? shortHash(p.address, 8, 6)}
                      v={
                        <span className="tnum">
                          {p.liquidityUsd != null ? fmtUsd(p.liquidityUsd) : "—"} · {shortHash(p.address, 6, 4)}
                        </span>
                      }
                    />
                  ))}
                  <R
                    k="Updated"
                    v={d.liquidity.updatedAt != null ? <UpdatedAgo ts={d.liquidity.updatedAt} /> : <NA reason={d.liquidity.reason ?? undefined} />}
                  />
                </dl>
                {!d.liquidity.configured ? (
                  <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
                    DEX indexer not configured — liquidity is not estimated from volume.
                  </p>
                ) : null}
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Holders &amp; Whales
                  </h2>
                  <ClassTag
                    kind={
                      d.holders.total != null || d.whales.exposureUsd != null
                        ? d.holders.freshness === "stale"
                          ? "CALCULATED"
                          : "LIVE ON-CHAIN"
                        : "UNKNOWN"
                    }
                  />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R
                    k="Holder addresses"
                    v={d.holders.total != null ? <span className="font-semibold">{fmtNum(d.holders.total)}</span> : "—"}
                  />
                  <R k="Top-10 concentration" v={d.holders.concentration?.top10 != null ? `${d.holders.concentration.top10.toFixed(2)}%` : "—"} />
                  <R k="Top-25 concentration" v={d.holders.concentration?.top25 != null ? `${d.holders.concentration.top25.toFixed(2)}%` : "—"} />
                  <R k="Top-50 concentration" v={d.holders.concentration?.top50 != null ? `${d.holders.concentration.top50.toFixed(2)}%` : "—"} />
                  <R
                    k="Burned share"
                    v={d.holders.burnedPct != null ? `${d.holders.burnedPct.toFixed(2)}%` : <NA reason="No verified share for burn addresses" />}
                  />
                  <R
                    k="Pool-held share"
                    v={d.holders.poolHeldPct != null ? `${d.holders.poolHeldPct.toFixed(2)}%` : <NA reason="Requires a DEX registry — not estimated" />}
                  />
                  <R
                    k="Largest holder"
                    v={
                      d.holders.largest?.address ? (
                        <span className="tnum">
                          {shortHash(d.holders.largest.address, 6, 4)}
                          {d.holders.topHolderPct != null ? ` · ${d.holders.topHolderPct.toFixed(2)}%` : ""}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <R k="Whale holdings USD" v={d.whales.exposureUsd != null ? fmtUsd(d.whales.exposureUsd) : "—"} />
                  <R k="Whales (≥ threshold)" v={d.whales.whaleCount != null ? fmtNum(d.whales.whaleCount) : "—"} />
                  <R k="Top-10 holder USD" v={d.whales.top10Usd != null ? fmtUsd(d.whales.top10Usd) : "—"} />
                  <R k="Whale inflow (24H)" v={d.whales.inflowUsd != null ? fmtUsd(d.whales.inflowUsd) : "—"} />
                  <R k="Whale outflow (24H)" v={d.whales.outflowUsd != null ? fmtUsd(d.whales.outflowUsd) : "—"} />
                  <R
                    k="Whale net flow (24H)"
                    v={
                      d.whales.netFlowUsd != null ? (
                        <span className={d.whales.netFlowUsd > 0 ? "text-pos" : d.whales.netFlowUsd < 0 ? "text-neg" : ""}>
                          {fmtUsd(d.whales.netFlowUsd)}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <R
                    k="Source"
                    v={
                      d.holders.source ? (
                        <span className="flex items-center justify-end gap-2">
                          <Tag tone={FRESH_TONE[(d.holders.freshness ?? "unavailable") as keyof typeof FRESH_TONE]}>
                            {(d.holders.freshness ?? "unavailable").toUpperCase()}
                          </Tag>
                          {d.holders.source}
                        </span>
                      ) : (
                        <NA reason={d.holders.reason ?? "No holder source available"} />
                      )
                    }
                  />
                </dl>
                <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
                  {d.whales.basis}. Holder count = addresses/accounts, not individuals. USD values =
                  verified balance × verified price, computed by RECODE — never provider-supplied.
                </p>
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Live activity</h2>
                  <ClassTag kind={d.activity.transfers24h != null ? "LIVE ON-CHAIN" : "UNKNOWN"} />
                </div>
                <dl className="space-y-2 text-[12.5px]">
                  <R k="Token transfers 24H" v={d.activity.transfers24h != null ? fmtNum(d.activity.transfers24h) : "—"} />
                  <R k="Unique active wallets 24H" v={d.activity.uniqueWallets24h != null ? fmtNum(d.activity.uniqueWallets24h) : "—"} />
                  <R
                    k="Buy transfers"
                    v={d.activity.buyTransfers != null ? fmtNum(d.activity.buyTransfers) : "—"}
                  />
                  <R
                    k="Sell transfers"
                    v={d.activity.sellTransfers != null ? fmtNum(d.activity.sellTransfers) : "—"}
                  />
                  <R k="Net transfer flow" v={d.activity.netFlowUsd != null ? fmtUsd(d.activity.netFlowUsd) : "—"} />
                  <R
                    k="Measured Transfer events"
                    v={
                      d.activity.recentTransferEvents
                        ? `${fmtNum(d.activity.recentTransferEvents.count)} in blocks ${fmtNum(d.activity.recentTransferEvents.fromBlock)}-${fmtNum(d.activity.recentTransferEvents.toBlock)}`
                        : "—"
                    }
                  />
                </dl>
                {d.activity.recent.length > 0 ? (
                  <div className="mt-3 border-t border-line-soft pt-2">
                    <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Recent transfers
                    </div>
                    <ul>
                      {d.activity.recent.map((t, i) => (
                        <li
                          key={`${t.hash ?? "tx"}-${t.ts}-${i}`}
                          className="tnum flex items-center gap-3 border-b border-line-soft py-1.5 text-[12px]"
                        >
                          <span className="w-16 text-faint">{timeAgo(t.ts)}</span>
                          <span className="w-20 truncate text-muted">{t.wallet ? shortHash(t.wallet, 6, 4) : "—"}</span>
                          <span className="w-24 text-right">{t.amount != null ? fmtNum(t.amount) : "—"}</span>
                          <span className="w-20 text-right text-faint">{t.usdLabel ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
                  {d.activity.basis}. USD values use the current verified price when available.
                </p>
              </Panel>

              {d.sources.length > 0 || d.security.risk === "UNKNOWN" ? (
                <Panel className="lg:col-span-2">
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Source availability
                  </h2>
                  <ul className="space-y-1.5 text-[12px] text-faint">
                    {d.sources.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                    {d.security.risk === "UNKNOWN" ? (
                      <li>• Explorer data unavailable — verification/risk verdict is UNKNOWN</li>
                    ) : null}
                  </ul>
                </Panel>
              ) : null}
            </div>

            <p className="mt-4 text-[10.5px] leading-relaxed text-faint">
              Risk is rule-based: LOW = indexed in RECODE&apos;s verified registry; MEDIUM = verified
              source outside the registry; HIGH = unverified contract; UNKNOWN = insufficient evidence.
              Every field comes from a configured live source (RPC probes, EIP-1967 storage reads,
              measured getLogs activity, verified market quotes); unavailable fields are labeled with a
              reason — never estimated, never zero. This is not a security audit and never constitutes advice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function R({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-1.5">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}