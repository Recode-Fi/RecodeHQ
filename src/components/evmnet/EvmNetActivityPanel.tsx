"use client";

import type { EvmNetChain } from "@/services/evmNetService";
import type { EvmNetWalletActivity } from "@/services/evmNetService";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel } from "@/components/ui/primitives";
import { fmtUsd, shortHash } from "@/lib/format";

const EXPLORERS: Record<EvmNetChain, string> = {
  ethereum: "https://etherscan.io",
  bsc: "https://bscscan.com",
  arbitrum: "https://arbiscan.io",
};

export function EvmNetActivityPanel({
  activity,
  nativeSymbol,
  chain,
}: {
  activity: EvmNetWalletActivity | null;
  nativeSymbol: string;
  chain: EvmNetChain;
}) {
  return (
    <Panel>
      <PanelHeader title={`${nativeSymbol} STABLECOIN ACTIVITY (RECENT)`} />
      {activity ? (
        activity.records.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted">
            {activity.errors[0] ?? "No stablecoin activity records in the scanned window."}
          </div>
        ) : (
          <ul className="divide-y divide-line/60">
            {activity.records.slice(0, 25).map((r) => (
              <li
                key={`${r.txHash}-${r.action}-${r.counterparty ?? ""}`}
                className="flex items-center justify-between px-4 py-2.5 text-[12.5px]"
              >
                <div className="min-w-0">
                  <span className="font-semibold">{r.action}</span>
                  <span className="ml-2">{fmtUsd(r.usd)} {r.symbol}</span>
                  {r.counterparty ? (
                    <span className="ml-2 text-muted">
                      {r.action === "Received" ? "from" : "to"} {shortHash(r.counterparty)}
                    </span>
                  ) : null}
                </div>
                <a
                  href={`${EXPLORERS[chain]}/tx/${r.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] text-green/80 hover:underline"
                >
                  tx ↗
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
          Scanned blocks {activity.fromBlock}–{activity.toBlock} — historical activity is limited to the
          available indexed window.
        </div>
      ) : null}
    </Panel>
  );
}