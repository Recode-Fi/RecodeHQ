"use client";

import { useEvmNetWallet } from "@/hooks/useEvmNet";
import type { EvmNetChain } from "@/services/evmNetService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, fmtNum, shortHash } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { EvmNetActivityPanel } from "./EvmNetActivityPanel";

const NAMES: Record<EvmNetChain, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Smart Chain",
  arbitrum: "Arbitrum One",
};

/** EVM NET Wallet Intelligence — per-chain balances + stablecoin activity. */
export function EvmNetWalletIntel({ chain, address }: { chain: EvmNetChain; address: string }) {
  const { balances, activity, status } = useEvmNetWallet(chain, address);

  useAgentPageContext(
    {
      wallet: {
        network: `${NAMES[chain]} (chain ${balances?.chainId ?? "?"})`,
        address,
        holdings: balances?.holdings.map((h) => ({
          symbol: h.symbol, amount: h.amount, priceUsd: h.priceUsd, valueUsd: h.valueUsd, status: h.status,
        })),
        totalValueUsd: balances?.totalValueUsd ?? null,
        activityCount: activity?.recordsCount ?? 0,
        dataStatus: status,
      },
    },
    `${chain} wallet intelligence`,
  );

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={`${NAMES[chain].toUpperCase()} WALLET — ${shortHash(address)}`}
          right={<LiveStatusBadge status={balances ? (balances.chainOnline ? "live" : "unavailable") : "syncing"} />}
        />
        {status === "loading" ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading {NAMES[chain]} wallet…</div>
        ) : balances ? (
          <div className="px-4 pb-4">
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Portfolio Value" value={balances.totalValueUsd != null ? fmtUsd(balances.totalValueUsd) : "Data unavailable"} />
              <Stat label="Holdings" value={String(balances.holdings.length)} />
              <Stat label="Priced" value={String(balances.pricedCount)} />
              <Stat label="Stablecoin Activity" value={String(activity?.recordsCount ?? 0)} />
            </div>
            {balances.holdings.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-muted">
                No non-zero holdings found for this wallet on {NAMES[chain]}.
              </div>
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
                              {h.kind === "native" ? "native" : "ERC-20"}
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
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">{NAMES[chain]} wallet data unavailable</div>
        )}
      </Panel>
      <EvmNetActivityPanel activity={activity} nativeSymbol={balances?.nativeSymbol ?? ""} chain={chain} />
    </div>
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
