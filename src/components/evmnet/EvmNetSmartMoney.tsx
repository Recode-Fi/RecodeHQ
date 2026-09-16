"use client";

import { useState } from "react";
import { useEvmNetSmartMoney } from "@/hooks/useEvmNet";
import type { EvmNetChain } from "@/services/evmNetService";
import { Panel, Chip } from "@/components/ui/primitives";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { EVM_NET_NAMES } from "./EvmNetRadar";

const WINDOWS = [
  { id: 24, label: "24H" },
  { id: 168, label: "7D" },
  { id: 720, label: "30D" },
] as const;

/** EVM NET Smart Money — per-chain verified net stablecoin flow ranking. */
export function EvmNetSmartMoney({ chain }: { chain: EvmNetChain }) {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>(24);
  const smart = useEvmNetSmartMoney(chain, win);
  const rows = smart.data ?? [];

  useAgentPageContext(
    {
      signals: {
        view: `${EVM_NET_NAMES[chain]} Smart Money (net stablecoin flow ranking)`,
        windowHours: win,
        wallets: rows.slice(0, 10).map((r) => ({ wallet: r.wallet, netUsd: r.netUsd, inflows: r.inflows, outflows: r.outflows })),
        dataStatus: smart.status,
      },
    },
    `${chain} smart money`,
  );

  return (
    <Panel>
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider">
          {EVM_NET_NAMES[chain].toUpperCase()} SMART MONEY — NET FLOW
        </h2>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => setWin(w.id)}>
              <Chip active={win === w.id}>{w.label}</Chip>
            </button>
          ))}
          <LiveStatusBadge status={smart.status === "live" ? "live" : smart.status === "unavailable" ? "unavailable" : "syncing"} />
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">
          No verified stablecoin flow events in this window yet.
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.wallet} className="flex items-center justify-between px-4 py-3 text-[12.5px]">
              <div className="min-w-0">
                <a href={`/app/wallet/${r.wallet}`} className="font-mono text-[12px] text-green hover:underline">
                  {shortHash(r.wallet)}
                </a>
                <div className="text-[11px] text-faint">
                  {r.inflows} in · {r.outflows} out · {r.transfers} transfers · last {timeAgo(r.lastActive)}
                </div>
              </div>
              <div className={`font-semibold ${r.netUsd != null && r.netUsd >= 0 ? "text-pos" : "text-neg"}`}>
                {r.netUsd != null ? fmtUsd(r.netUsd) : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-3 text-[11px] text-faint">
        Ranking reflects measured stablecoin flows on {EVM_NET_NAMES[chain]} only (accumulation − distribution). ROI/win-rate
        require per-wallet trade attribution — rendered as unavailable, never estimated.
      </div>
    </Panel>
  );
}