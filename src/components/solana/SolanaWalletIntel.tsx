"use client";

import Link from "next/link";
import { useSolanaWalletBalances, useSolanaWalletActivity } from "@/hooks/useSolana";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Panel, Tag } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/states";
import { PanelHeader, StatStrip, StateBlock } from "@/components/kit/Kit";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, fmtNum, fmtAmount, fmtPct, shortHash, timeAgo, changeTone } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ============================================================
 * SOLANA WALLET INTELLIGENCE — base58 address, live mainnet RPC.
 * Native SOL + SPL token balances (USD only where verified pricing
 * exists), plus real signature activity. Never routed through EVM
 * balance logic and never mixed with 0x addresses.
 * ============================================================
 */
export function SolanaWalletIntel({ address }: { address: string }) {
  const balances = useSolanaWalletBalances(address);
  const activity = useSolanaWalletActivity(address);
  const b = balances.data;
  const a = activity.data;
  const firstActivity = a?.firstSeen ?? null;

  useAgentPageContext(
    {
      wallet: {
        network: "Solana (mainnet-beta)",
        address,
        totalValueUsd: b?.totalValueUsd ?? null,
        holdingsCount: b?.holdings.length ?? null,
        pricedHoldings: b?.pricedCount ?? null,
        txCount: a?.txCount ?? null,
        firstSeen: a?.firstSeen ?? null,
        balancesStatus: balances.status,
      },
    },
    "solana wallet intelligence",
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
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
        <LiveStatusBadge
          status={balances.status === "live" ? "live" : balances.status === "unavailable" ? "unavailable" : "syncing"}
          label={balances.status === "live" ? "LIVE" : undefined}
        />
      </header>

      <StateBlock
        status={balances.status === "live" ? "live" : balances.status === "unavailable" ? "unavailable" : "syncing"}
        loadingRows={5}
        empty={null}
      >
        {b ? (
          <>
            <StatStrip
              stats={[
                {
                  label: "Portfolio value",
                  value: b.totalValueUsd != null ? fmtUsd(b.totalValueUsd) : "Data unavailable",
                  sub: b.pricedCount > 0 ? `${b.pricedCount} priced holdings` : "no verified pricing",
                },
                { label: "Holdings", value: fmtNum(b.holdings.length) },
                { label: "Activity (recent)", value: a?.txCount != null ? fmtNum(a.txCount) : "Data unavailable" },
                { label: "First activity", value: firstActivity != null ? timeAgo(firstActivity) : "Data unavailable" },
                { label: "RPC", value: b.chainOnline ? "mainnet-beta online" : "unavailable" },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <PanelHeader title="Token holdings" sub="Native SOL + SPL accounts · live balances" />
                {b.errors.length > 0 ? (
                  <p className="mb-3 text-[11.5px] text-warn">{b.errors.join(" · ")}</p>
                ) : null}
                <ul className="tnum divide-y divide-line-soft text-[12.5px]">
                  {b.holdings.map((h, i) => (
                    <li key={`${h.mint ?? "sol"}-${i}`} className="flex items-center gap-3 py-2">
                      {h.kind === "spl" ? (
                        <AssetLogo symbol={h.symbol} url={h.logoUrl} size={20} />
                      ) : (
                        <span className="tnum flex h-5 w-5 items-center justify-center rounded-[4px] border border-line bg-panel-2 text-[8px] font-bold text-muted">
                          SOL
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{h.symbol ?? shortHash(h.mint)}</span>
                        <span className="block text-[10.5px] text-faint">
                          {h.valueUsd == null && h.priceUsd == null
                            ? "unpriced — no verified market"
                            : h.source}
                        </span>
                      </span>
                      <span className="flex items-center gap-4">
                        <span>{h.amount != null ? fmtAmount(h.amount) : "—"}</span>
                        <span className="w-24 text-right">{h.valueUsd != null ? fmtUsd(h.valueUsd) : "—"}</span>
                        <span className={`w-14 text-right ${changeTone(h.change24hPct)}`}>
                          {fmtPct(h.change24hPct)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader title="Wallet activity" sub="Real signature history from Solana RPC" />
                <StateBlock
                  status={
                    activity.status === "live"
                      ? "live"
                      : activity.status === "unavailable"
                        ? "unavailable"
                        : "syncing"
                  }
                  loadingRows={4}
                  empty={<p className="py-8 text-center text-[12px] text-faint">No activity records.</p>}
                >
                  {a ? (
                    a.signatures.length > 0 ? (
                      <ul className="tnum divide-y divide-line-soft text-[12px]">
                        {a.signatures.map((s) => (
                          <li key={s.signature} className="flex items-center justify-between gap-3 py-1.5">
                            <a
                              href={s.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 truncate text-muted hover:text-green"
                            >
                              {shortHash(s.signature, 10, 6)}
                            </a>
                            <span className="flex shrink-0 items-center gap-3">
                              {s.failed ? <span className="text-neg">failed</span> : null}
                              <span className="text-faint">{s.ts != null ? timeAgo(s.ts) : "pending"}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-8 text-center text-[12px] text-faint">
                        No transactions found for this address.
                      </p>
                    )
                  ) : null}
                </StateBlock>
              </Panel>
            </div>
          </>
        ) : null}
      </StateBlock>

      <p className="text-[10.5px] text-faint">
        Solana wallet intelligence reads public chain state only (mainnet RPC). Balances without
        verified market pricing show "—" — portfolio value is never estimated from unpriced
        tokens. EVM wallets are analyzed separately on{" "}
        <Link href="/app/wallets" className="text-green hover:underline">
          Wallet Intelligence (EVM)
        </Link>
        .
      </p>
    </div>
  );
}