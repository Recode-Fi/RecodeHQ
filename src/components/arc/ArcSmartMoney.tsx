"use client";

import Link from "next/link";
import { useState } from "react";
import { useArcSmartMoney } from "@/hooks/useArc";
import type { ArcSmartMoneyWallet } from "@/services/arcService";
import { Panel, Chip } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" || s === "syncing" || s === "connecting"
    ? (s as DataStatus)
    : "syncing";
}
import { NetworkIcon } from "@/components/ui/NetworkIcon";

const WINDOWS = [
  { id: 24, label: "24H" },
  { id: 168, label: "7D" },
  { id: 720, label: "30D" },
] as const;

/**
 * ARC SMART MONEY — wallets ranked by verified net USDC flow
 * (inflows + mints âˆ’ outflows âˆ’ burns) from the Arc system-emitter
 * event stream. Transfers are direction-neutral. Scores/PnL/win-rate
 * are not reliably measurable here and are never fabricated.
 */
export function ArcSmartMoney() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>(24);
  const smart = useArcSmartMoney(win);
  const rows: ArcSmartMoneyWallet[] = smart.data ?? [];

  useAgentPageContext(
    {
      signals: {
        view: "Arc Smart Money (net USDC flow ranking)",
        windowHours: win,
        wallets: rows.slice(0, 10).map((r) => ({
          wallet: r.wallet,
          netUsdc: r.netUsdc,
          inflows: r.inflows,
          outflows: r.outflows,
        })),
        dataStatus: smart.status,
      },
    },
    "arc smart money",
  );

  return (
    <Panel>
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider">
          <NetworkIcon id="arc" size={16} /> ARC SMART MONEY — NET USDC FLOW
        </h2>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => setWin(w.id)}>
              <Chip active={win === w.id}>{w.label}</Chip>
            </button>
          ))}
          <LiveStatusBadge status={toDataStatus(smart.status)} />
        </div>
      </div>

      {smart.status === "loading" || smart.status === "idle" ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading Arc smart money…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-muted">{"No verified Arc USDC flow events in this window yet."}</div>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.wallet} className="flex items-center justify-between px-4 py-3 text-[12.5px]">
              <div className="min-w-0">
                <Link
                  href={`/app/wallet/${r.wallet}`}
                  className="font-mono text-[12px] text-green hover:underline"
                >
                  {shortHash(r.wallet)}
                </Link>
                <div className="text-[11px] text-faint">
                  {r.inflows} in · {r.outflows} out · {r.transfers} transfers · last{" "}
                  {timeAgo(r.lastActive)}
                </div>
              </div>
              <div className={`font-semibold ${r.netUsdc != null && r.netUsdc >= 0 ? "text-pos" : "text-neg"}`}>
                {r.netUsdc != null ? fmtUsd(r.netUsdc) : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-3 text-[11px] text-faint">
        Ranking reflects measured USDC flows only (accumulation âˆ’ distribution). ROI/win-rate
        require per-wallet trade attribution — rendered as unavailable, never estimated.
      </div>
    </Panel>
  );
}
