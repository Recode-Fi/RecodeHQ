"use client";

import { useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import type { LiveTx } from "@/services/recodeService";
import { Panel, Chip, Tag } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";

/** Transaction explorer — the verified on-chain activity tape. */
export function ExplorerView() {
  const txs = useSyncPolling<LiveTx[]>("/api/sync/transactions", 5_000);
  const [action, setAction] = useState("all");
  const rows = (txs.data ?? []).filter((t) => action === "all" || t.action === action);

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Transaction Explorer</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          The live tape of verified token transfers on Robinhood Chain. Click any asset or wallet
          for its full intelligence profile.
        </p>
      </header>
      <Panel padded={false}>
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
          {["all", "buy", "sell", "transfer", "mint"].map((a) => (
            <Chip key={a} active={action === a} onClick={() => setAction(a)}>
              {a.toUpperCase()}
            </Chip>
          ))}
        </div>
        <StateBlock status={txs.status} loadingRows={12}>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-faint">No activity indexed yet.</p>
          ) : (
            <ul>
              {rows.slice(0, 60).map((t) => (
                <li key={t.id ?? `${t.hash}-${t.ts}-${t.action}-${t.wallet}-${t.amount ?? 0}`} className="row-hover flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-2.5 text-[12.5px]">
                  <Tag tone={t.action === "buy" ? "pos" : t.action === "sell" ? "neg" : "neutral"}>{t.action}</Tag>
                  {t.symbol ? (
                    <a href={`/app/asset/${t.symbol}`} className="w-16 font-medium text-green hover:underline">
                      {t.symbol}
                    </a>
                  ) : (
                    <span className="w-16 text-faint">—</span>
                  )}
                  <span className="tnum w-28 text-right">{t.amount != null ? t.amount.toLocaleString("en", { maximumFractionDigits: 2 }) : "—"}</span>
                  <span className="tnum w-24 text-right">{fmtUsd(t.usd)}</span>
                  <a href={`/app/wallet/${t.wallet ?? ""}`} className="tnum min-w-0 flex-1 truncate text-muted hover:text-text">
                    {t.wallet ? shortHash(t.wallet) : "unknown wallet"}
                  </a>
                  <span className="tnum text-faint">{timeAgo(t.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </StateBlock>
      </Panel>
    </div>
  );
}
