"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import type { LiveWhale } from "@/services/recodeService";
import { Panel, Chip } from "@/components/ui/primitives";
import { StateBlock } from "@/components/kit/Kit";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

const WINDOWS = ["24H", "7D", "30D", "ALL"] as const;

/**
 * Smart Money — wallet ranking from verified on-chain flows. Ranking by net
 * flow is engine-verified; ROI / win-rate metrics require per-wallet trade
 * history and render "Insufficient data" rather than estimates.
 */
export function SmartMoneyView() {
  const whales = useSyncPolling<LiveWhale[]>("/api/sync/whales", 10_000);
  const [win, setWin] = useState<(typeof WINDOWS)[number]>("24H");

  const ranked = useMemo(() => {
    const cutoff = win === "24H" ? 86_400_000 : win === "7D" ? 7 * 86_400_000 : win === "30D" ? 30 * 86_400_000 : Number.MAX_SAFE_INTEGER;
    const byWallet = new Map<string, { net: number; buys: number; sells: number; last: number; assets: Set<string> }>();
    for (const w of whales.data ?? []) {
      if (w.ts < Date.now() - cutoff || !w.wallet || w.usd == null) continue;
      const e = byWallet.get(w.wallet) ?? { net: 0, buys: 0, sells: 0, last: 0, assets: new Set<string>() };
      if (w.kind === "buy" || w.kind === "accumulation") {
        e.net += w.usd;
        e.buys += 1;
      } else if (w.kind === "sell" || w.kind === "distribution") {
        e.net -= w.usd;
        e.sells += 1;
      }
      if (w.symbol) e.assets.add(w.symbol);
      e.last = Math.max(e.last, w.ts);
      byWallet.set(w.wallet, e);
    }
    return [...byWallet.entries()]
      .map(([address, e]) => ({ address, ...e }))
      .sort((a, b) => b.net - a.net)
      .slice(0, 20);
  }, [whales.data, win]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <NetworkIcon id="robinhood-chain" size={20} />
          Smart Money
        </h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Wallets ranked by verified net on-chain flow in tokenized assets. RECODE does not label
          opaque "smart money" — ranking reflects measured flows only. ROI / win-rate columns
          require per-wallet trade attribution and show insufficient data until that provider is
          wired.
        </p>
      </header>

      <div className="mb-3 flex gap-1.5">
        {WINDOWS.map((w) => (
          <Chip key={w} active={win === w} onClick={() => setWin(w)}>
            {w}
          </Chip>
        ))}
      </div>

      <Panel padded={false}>
        <StateBlock status={whales.status} loadingRows={8}>
          {ranked.length === 0 ? (
            <p className="px-4 py-12 text-center text-[12.5px] text-faint">
              No verified whale flows in this window yet.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 pb-2 font-semibold">#</th>
                  <th className="px-3 pb-2 font-semibold">Wallet</th>
                  <th className="px-3 pb-2 text-right font-semibold">Net Flow</th>
                  <th className="px-3 pb-2 text-right font-semibold">Buys / Sells</th>
                  <th className="px-3 pb-2 text-right font-semibold">Assets</th>
                  <th className="px-4 pb-2 text-right font-semibold">ROI · Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.address} className="row-hover border-b border-line-soft">
                    <td className="tnum px-4 py-2.5 text-faint">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/app/wallet/${r.address}`} className="tnum text-green hover:underline">
                        {shortHash(r.address)}
                      </Link>
                    </td>
                    <td className={`tnum px-3 py-2.5 text-right ${r.net >= 0 ? "text-pos" : "text-neg"}`}>
                      {fmtUsd(r.net)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-muted">
                      {r.buys} / {r.sells}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-muted">{r.assets.size}</td>
                    <td className="px-4 py-2.5 text-right text-faint">Insufficient data</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </StateBlock>
      </Panel>
      <p className="mt-2 text-[10.5px] text-faint">
        Derived exclusively from verified on-chain transfer flows indexed by the sync engine ·
        last event {whales.data?.[0]?.ts ? timeAgo(whales.data[0].ts) : "—"}
      </p>
    </div>
  );
}
