"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSolanaWalletBalances, useSolanaWalletActivityFeed } from "@/hooks/useSolana";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Panel, Tag } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/states";
import { PanelHeader, StatStrip } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo, useNow } from "@/components/ui/LiveStatus";
import { fmtUsd, fmtAmount, fmtPct, shortHash, timeAgo, changeTone } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ============================================================
 * SOLANA WALLET INTELLIGENCE — base58 address, live mainnet RPC.
 * Holdings: SOL + SPL/Token-2022 accounts with resolved token
 * identity and exact-mint verified pricing (USD only where priced;
 * unpriced holdings excluded from the portfolio total). Activity:
 * normalized transaction records parsed from real on-chain
 * transactions — with pagination. Never mixed with EVM logic.
 * ============================================================
 */

const ACTION_TONE: Record<string, string> = {
  swap: "text-green",
  receive: "text-pos",
  sent: "text-neg",
  stake: "text-warn",
  transaction: "text-muted",
};

export function SolanaWalletIntel({ address }: { address: string }) {
  const balances = useSolanaWalletBalances(address);
  const activity = useSolanaWalletActivityFeed(address);
  const now = useNow(1_000);
  const b = balances.data;
  const records = activity.records;

  const firstActivity = useMemo(
    () =>
      records.reduce<number | null>(
        (acc, r) => (r.ts != null && (acc == null || r.ts < acc) ? r.ts : acc),
        null,
      ),
    [records],
  );

  useAgentPageContext(
    {
      wallet: {
        network: "Solana (mainnet-beta)",
        address,
        totalValueUsd: b?.totalValueUsd ?? null,
        holdingsCount: b?.holdings.length ?? null,
        pricedHoldings: b?.pricedCount ?? null,
        unpricedHoldings: b?.unpricedCount ?? null,
        activityRecordCount: records.length,
        activitySignatures: activity.pages[0]?.signaturesCount ?? null,
        firstActivity,
        balancesStatus: balances.status,
        activityStatus: activity.status,
      },
    },
    "solana wallet intelligence",
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Wallet Intelligence</h1>
            <Tag>
              <span className="inline-flex items-center gap-1.5">
                <NetworkIcon id="solana" size={12} />
                Solana
              </span>
            </Tag>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="tnum break-all text-[12px] text-muted">{address}</code>
            <CopyButton text={address} />
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] text-green hover:underline"
            >
              Solscan ↗
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusBadge
            status={balances.status === "live" ? "live" : balances.status === "unavailable" ? "unavailable" : "syncing"}
            label={balances.status === "live" ? "LIVE" : undefined}
          />
          <UpdatedAgo ts={b?.updatedAt ?? null} />
        </div>
      </header>

      {/* ── Summary — every card reflects the actual rendered data ── */}
      <StatStrip
        stats={[
          {
            label: "Portfolio value",
            value: b?.totalValueUsd != null ? fmtUsd(b.totalValueUsd) : "Data unavailable",
            sub: b == null ? "loading balances" : `${b.pricedCount} priced · ${b.unpricedCount} unpriced (excluded)`,
          },
          { label: "Holdings", value: b ? String(b.holdings.length) : "—" },
          {
            label: "Activity (recent)",
            value: activity.status === "live" ? String(records.length) : "—",
            sub: "parsed records shown below",
          },
          {
            label: "First activity",
            value: firstActivity != null ? timeAgo(firstActivity) : "—",
            sub: "within loaded window",
          },
          { label: "RPC", value: b ? (b.chainOnline ? "mainnet-beta online" : "unavailable") : "…" },
        ]}
      />

      <HoldingsPanel balances={balances} />
      <ActivityPanel activity={activity} />
    </div>
  );
}

function HoldingsPanel({
  balances,
}: {
  balances: ReturnType<typeof useSolanaWalletBalances>;
}) {
  const [showAll, setShowAll] = useState(false);
  const b = balances.data;
  return (
    <Panel>
      <PanelHeader
        title="Token holdings"
        sub="Native SOL + SPL/Token-2022 · live balances · exact-mint verified pricing"
      />
      {b && b.errors.length > 0 ? (
        <p className="mb-3 text-[11.5px] text-warn">{b.errors.join(" · ")}</p>
      ) : null}
      {!b ? (
        <p className="py-8 text-center text-[12.5px] text-faint">
          Loading token holdings… (SOL balance, SPL accounts, metadata, prices)
        </p>
      ) : b.holdings.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-faint">
          No non-zero token accounts for this address.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[9.5px] uppercase tracking-[0.12em] text-faint">
                  <th className="pb-2 font-semibold">Token</th>
                  <th className="hidden pb-2 text-right font-semibold md:table-cell">Mint</th>
                  <th className="pb-2 text-right font-semibold">Balance</th>
                  <th className="pb-2 text-right font-semibold">Price</th>
                  <th className="pb-2 text-right font-semibold">Value</th>
                  <th className="pb-2 text-right font-semibold">24H</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? b.holdings : b.holdings.slice(0, 8)).map((h, i) => (
                  <tr key={`${h.mint ?? "sol"}-${i}`} className="border-b border-line-soft align-top">
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2.5">
                        {h.kind === "spl" && h.mint ? (
                          <Link href={`/app/token/${encodeURIComponent(h.mint)}`} title={h.mint}>
                            <AssetLogo symbol={h.symbol} url={h.logoUrl} size={22} />
                          </Link>
                        ) : (
                          <span className="tnum flex h-[22px] w-[22px] items-center justify-center rounded-[4px] border border-line bg-panel-2 text-[8px] font-bold text-muted">
                            SOL
                          </span>
                        )}
                        <div className="min-w-0">
                          {h.kind === "spl" && h.mint ? (
                            <Link
                              href={`/app/token/${encodeURIComponent(h.mint)}`}
                              className="block max-w-44 truncate font-medium text-text hover:text-green"
                              title={h.name ?? h.mint}
                            >
                              {h.name ?? h.symbol ?? shortHash(h.mint)}
                            </Link>
                          ) : (
                            <span className="block font-medium">{h.symbol ?? "SOL"}</span>
                          )}
                          <span className="block max-w-44 truncate text-[10.5px] text-faint">
                            {h.status === "priced" && h.symbol
                              ? `$${h.symbol}`
                              : h.mint
                                ? shortHash(h.mint)
                                : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="tnum hidden py-2.5 text-right text-faint md:table-cell" title={h.mint ?? undefined}>
                      {h.mint ? shortHash(h.mint, 4, 4) : "—"}
                    </td>
                    <td className="tnum py-2.5 text-right">{h.amount != null ? fmtAmount(h.amount) : "—"}</td>
                    <td className="tnum py-2.5 text-right">
                      {h.priceUsd != null ? (
                        fmtUsd(h.priceUsd)
                      ) : (
                        <span className="text-faint" title="No verified market price">
                          —
                        </span>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-right">
                      {h.valueUsd != null ? (
                        fmtUsd(h.valueUsd)
                      ) : (
                        <span
                          className="text-faint"
                          title={h.status === "no-market" ? "No verified market price" : "Market provider unavailable"}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className={`tnum py-2.5 text-right ${changeTone(h.change24hPct)}`}>
                      {h.change24hPct != null ? fmtPct(h.change24hPct) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.holdings.length > 8 ? (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 text-[11.5px] text-green hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${b.holdings.length} holdings`}
            </button>
          ) : null}
          {b.holdings.some((h) => h.status !== "priced") ? (
            <p className="mt-2 text-[10.5px] text-faint">
              Holdings without a verified exact-mint market show "—" for price/value — never
              estimated. Click a token for its full Solana token intelligence.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function ActivityPanel({
  activity,
}: {
  activity: ReturnType<typeof useSolanaWalletActivityFeed>;
}) {
  const records = activity.records;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? records : records.slice(0, 25);

  return (
    <Panel>
      <PanelHeader
        title="Wallet activity"
        sub="Live transactions parsed from Solana RPC — classified from real tx structure"
        right={
          <button
            type="button"
            onClick={activity.refresh}
            className="text-[10.5px] text-faint transition-colors hover:text-text"
          >
            Refresh
          </button>
        }
      />
      {activity.status === "unavailable" ? (
        <p className="py-8 text-center text-[12.5px] text-warn">
          {activity.error ?? "Wallet activity unavailable — RPC rate limited or offline."}
        </p>
      ) : activity.status !== "live" ? (
        <p className="py-8 text-center text-[12.5px] text-faint">Loading wallet activity…</p>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-faint">
          No transactions found for this address.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line-soft">
            {visible.map((r) => (
              <li key={r.signature} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span
                    className={`text-[9.5px] font-bold uppercase tracking-wider ${ACTION_TONE[r.action] ?? "text-muted"}`}
                  >
                    {r.label}
                  </span>
                  {r.program ? <span className="text-muted">{r.program}</span> : null}
                  {r.solAmount != null && Math.abs(r.solAmount) > 0 ? (
                    <span className="tnum">
                      {r.solAmount > 0 ? "+" : ""}
                      {fmtAmount(r.solAmount)} SOL
                    </span>
                  ) : null}
                  {r.tokenAmount != null ? (
                    <span className="tnum">
                      {r.tokenOutMint && r.tokenOutMint !== r.tokenMint ? (
                        <>
                          {fmtAmount(r.tokenOutAmount ?? 0)}{" "}
                          {r.tokenOutSymbol ?? (r.tokenOutMint ? shortHash(r.tokenOutMint, 4, 4) : "?")} →{" "}
                          {fmtAmount(r.tokenAmount)}{" "}
                          {r.tokenSymbol ?? (r.tokenMint ? shortHash(r.tokenMint, 4, 4) : "?")}
                        </>
                      ) : (
                        <>
                          {r.action === "sent" ? "−" : "+"}
                          {fmtAmount(r.tokenAmount)}{" "}
                          {r.tokenSymbol ?? (r.tokenMint ? shortHash(r.tokenMint, 4, 4) : "tokens")}
                        </>
                      )}
                    </span>
                  ) : null}
                  {r.usd != null ? <span className="tnum font-medium">{fmtUsd(r.usd)}</span> : null}
                  {r.failed ? (
                    <span className="text-[9.5px] font-bold uppercase text-neg">failed</span>
                  ) : null}
                  {r.detailsUnavailable ? (
                    <span
                      className="text-[9.5px] uppercase text-warn"
                      title="Transaction details could not be fetched (RPC rate limit)"
                    >
                      details unavailable
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2 text-[10.5px] text-faint">
                    {r.counterparty ? (
                      <span className="tnum" title={r.counterparty}>
                        {r.action === "receive" ? "From" : "To"} {shortHash(r.counterparty)}
                      </span>
                    ) : null}
                    <span>{r.ts != null ? timeAgo(r.ts) : "pending"}</span>
                    <a
                      href={r.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tnum text-muted hover:text-green"
                      title={`View ${r.signature} on Solscan`}
                    >
                      {shortHash(r.signature, 6, 4)} ↗
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {activity.pages.some((p) => p.detailsUnavailable > 0) ? (
            <p className="mt-2 text-[10.5px] text-warn">
              Some transaction details unavailable (RPC rate limit) — those records show without
              amounts; press Refresh to retry.
            </p>
          ) : null}
          {records.length > visible.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 text-[11.5px] text-green hover:underline"
            >
              Show all {records.length} records
            </button>
          ) : null}
          {activity.hasMore ? (
            <button
              type="button"
              onClick={activity.loadMore}
              disabled={activity.loadingMore}
              className="mt-3 w-full rounded-[4px] border border-line bg-panel-2 py-2 text-[11.5px] text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              {activity.loadingMore ? "Loading older activity…" : "Load more activity"}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}
