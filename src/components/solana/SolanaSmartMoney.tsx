"use client";

import Link from "next/link";
import { useState } from "react";
import { useSolanaSmartMoney } from "@/hooks/useSolana";
import type { SolanaSmartMoneyWallet } from "@/services/solanaService";
import { Panel, Chip } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

const WINDOWS = [
  { id: 24, label: "24H" },
  { id: 168, label: "7D" },
  { id: 720, label: "30D" },
] as const;

/**
 * ============================================================
 * SOLANA SMART MONEY — wallets ranked by verified net flow
 * (accumulation − distribution) from the Solana whale pipeline
 * (largest-account balance deltas). Ranking reflects measured
 * flows only; transfers are direction-neutral and excluded from
 * the net. ROI / win-rate require per-wallet trade attribution
 * and render "Insufficient data" rather than estimates.
 * ============================================================
 */
export function SolanaSmartMoney() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>(24);
  const smart = useSolanaSmartMoney(win);
  const rows: SolanaSmartMoneyWallet[] = smart.data ?? [];

  useAgentPageContext(
    {
      signals: {
        view: "Solana Smart Money (net-flow ranking)",
        windowHours: win,
        wallets: rows.slice(0, 10).map((r) => ({
          wallet: r.wallet,
          netUsd: r.netUsd,
          accumulations: r.accumulations,
          distributions: r.distributions,
          assets: r.assets,
        })),
        dataStatus: smart.status,
      },
    },
    "solana smart money",
  );

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <NetworkIcon id="solana" size={22} />
          <div>
            <h1 className="text-xl font-semibold">Smart Money · Solana</h1>
            <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
              Solana wallets ranked by verified net on-chain flow (accumulation − distribution of
              whale-size token balances, largest-account deltas on Solana RPC). RECODE does not
              label opaque &quot;smart money&quot; — ranking reflects measured flows only.
            </p>
          </div>
        </div>
        <LiveStatusBadge
          status={smart.status === "live" ? "live" : smart.status === "unavailable" ? "unavailable" : "syncing"}
          label={smart.status === "live" ? "LIVE" : undefined}
        />
      </header>

      <div className="mb-3 flex gap-1.5">
        {WINDOWS.map((w) => (
          <Chip key={w.id} active={win === w.id} onClick={() => setWin(w.id)}>
            {w.label}
          </Chip>
        ))}
      </div>

      <Panel padded={false}>
        <StateBlock
          status={smart.status === "live" ? "live" : smart.status === "unavailable" ? "unavailable" : "syncing"}
          loadingRows={8}
          empty={
            <p className="px-4 py-12 text-center text-[12.5px] text-faint">
              No verified whale flows on Solana in this window yet — the engine records a flow
              only when a verified balance delta crosses the whale threshold.
            </p>
          }
        >
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 pb-2 font-semibold">#</th>
                <th className="px-3 pb-2 font-semibold">Wallet</th>
                <th className="px-3 pb-2 text-right font-semibold">Net Flow</th>
                <th className="px-3 pb-2 text-right font-semibold">Accum / Dist</th>
                <th className="hidden px-3 pb-2 text-right font-semibold md:table-cell">Transfers</th>
                <th className="px-3 pb-2 text-right font-semibold">Assets</th>
                <th className="px-3 pb-2 text-right font-semibold">Last Active</th>
                <th className="px-4 pb-2 text-right font-semibold">ROI · Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.wallet} className="row-hover border-b border-line-soft">
                  <td className="tnum px-4 py-2.5 text-faint">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/app/wallet/${r.wallet}`} className="tnum text-green hover:underline">
                      {shortHash(r.wallet)}
                    </Link>
                  </td>
                  <td className={`tnum px-3 py-2.5 text-right ${(r.netUsd ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                    {r.netUsd != null ? fmtUsd(r.netUsd) : "—"}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-muted">
                    {r.accumulations} / {r.distributions}
                  </td>
                  <td className="tnum hidden px-3 py-2.5 text-right text-muted md:table-cell">{r.transfers}</td>
                  <td className="px-3 py-2.5 text-right text-muted" title={r.assets.join(", ") || undefined}>
                    {r.assets.length}
                  </td>
                  <td className="px-3 py-2.5 text-right text-faint">{timeAgo(r.lastActive)}</td>
                  <td className="px-4 py-2.5 text-right text-faint">Insufficient data</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StateBlock>
      </Panel>
      <p className="mt-2 text-[10.5px] text-faint">
        Derived exclusively from verified largest-account balance deltas on Solana mainnet RPC ·
        last event {rows.length > 0 ? timeAgo(Math.max(...rows.map((r) => r.lastActive))) : "—"}
      </p>
    </div>
  );
}