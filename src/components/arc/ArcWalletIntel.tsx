"use client";

import { useArcWallet } from "@/hooks/useArc";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, fmtNum, shortHash } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" || s === "syncing" || s === "connecting"
    ? (s as DataStatus)
    : "syncing";
}
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ARC WALLET INTELLIGENCE — native USDC (gas, 18 decimals → face
 * value), USDC ERC-20 interface balance, tracked-token holdings and
 * wallet-adjacent USDC activity. Never mixes with Solana or other
 * EVM chains; unpriced holdings stay visible with "—".
 */
export function ArcWalletIntel({ address }: { address: string }) {
  const { balances, activity, status } = useArcWallet(address);

  useAgentPageContext(
    {
      wallet: {
        network: "Arc (chain 5042)",
        address,
        holdings: balances?.holdings.map((h) => ({
          symbol: h.symbol,
          amount: h.amount,
          priceUsd: h.priceUsd,
          valueUsd: h.valueUsd,
          status: h.status,
        })),
        totalValueUsd: balances?.totalValueUsd ?? null,
        activityCount: activity?.recordsCount ?? 0,
        dataStatus: status,
      },
    },
    "arc wallet intelligence",
  );

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={`ARC WALLET — ${shortHash(address)}`}
          right={
            balances ? (
              <LiveStatusBadge status={balances.chainOnline ? ("live" as DataStatus) : ("unavailable" as DataStatus)} />
            ) : (
              <LiveStatusBadge status={toDataStatus(status)} />
            )
          }
        />
        {status === "loading" ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading Arc wallet…</div>
        ) : balances ? (
          <div className="px-4 pb-4">
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat
                label="Portfolio Value"
                value={
                  balances.totalValueUsd != null
                    ? fmtUsd(balances.totalValueUsd)
                    : "Data unavailable"
                }
              />
              <Stat label="Holdings" value={String(balances.holdings.length)} />
              <Stat label="Priced" value={String(balances.pricedCount)} />
              <Stat label="USDC Activity" value={String(activity?.recordsCount ?? 0)} />
            </div>
            {balances.holdings.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted">No non-zero holdings found for this wallet on Arc.</div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 font-medium">Token</th>
                    <th className="py-2 font-medium">Balance</th>
                    <th className="py-2 font-medium">Price</th>
                    <th className="py-2 font-medium">USD Value</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.holdings.map((h) => (
                    <tr key={h.address ?? "native"} className="border-t border-line/60">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <AssetLogo symbol={h.symbol ?? undefined} url={null} size={20} />
                          <div>
                            <div className="font-medium">{h.symbol ?? "—"}</div>
                            <div className="text-[11px] text-faint">
                              {h.kind === "native-gas" ? "native gas" : "ERC-20"}
                              {h.address ? ` · ${shortHash(h.address)}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5">{h.amount != null ? fmtNum(h.amount) : "—"}</td>
                      <td className="py-2.5">{h.priceUsd != null ? fmtUsd(h.priceUsd) : "—"}</td>
                      <td className="py-2.5">
                        {h.valueUsd != null ? fmtUsd(h.valueUsd) : "—"}
                        {h.status === "unpriced" ? (
                          <span className="ml-1.5 text-[11px] text-faint">no verified market</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {balances.errors.length > 0 ? (
              <div className="mt-3 text-[11px] text-warn">{balances.errors.join(" · ")}</div>
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">Arc wallet data unavailable</div>
        )}
      </Panel>

      <ArcActivityPanel activity={activity} />
    </div>
  );
}

type ArcActivity = NonNullable<ReturnType<typeof useArcWallet>["activity"]>;

function ArcActivityPanel({ activity }: { activity: ArcActivity | null }) {
  return (
    <Panel>
      <PanelHeader title="USDC ACTIVITY (RECENT)" />
      {activity ? (
        activity.records.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">{activity.errors[0] ?? "No USDC activity records in the scanned window."}</div>
        ) : (
          <ul className="divide-y divide-line/60">
            {activity.records.slice(0, 25).map((r) => (
              <li
                key={`${r.txHash}-${r.action}-${r.counterparty ?? ""}`}
                className="flex items-center justify-between px-4 py-2.5 text-[12.5px]"
              >
                <div className="min-w-0">
                  <span className="font-semibold">{r.action}</span>
                  <span className="ml-2">{fmtUsd(r.usd)} USDC</span>
                  {r.counterparty ? (
                    <span className="ml-2 text-muted">
                      {r.action === "Received" ? "from" : "to"} {shortHash(r.counterparty)}
                    </span>
                  ) : null}
                </div>
                <a
                  href={r.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] text-green/80 hover:underline"
                >
                  tx â†—
                </a>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading wallet activity…</div>
      )}
      {activity?.recordsCount ? (
        <div className="px-4 py-3 text-[11px] text-faint">
          Scanned blocks {activity.fromBlock}–“{activity.toBlock} (no Arc indexer configured —
          history depth is limited to the scanned window).
        </div>
      ) : null}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-[15px] font-semibold">{value}</div>
    </div>
  );
}
