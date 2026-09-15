"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveMarkets } from "@/hooks/useSync";
import { watchlistService } from "@/services/watchlistService";
import type { WatchEntry } from "@/lib/types";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd } from "@/lib/format";

/** Watchlist — saved assets, wallets and contracts with live verified columns. */
export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const markets = useLiveMarkets("24H");

  useEffect(() => {
    const load = () => setEntries(watchlistService.list());
    load();
    window.addEventListener("recode:watchlist", load);
    return () => window.removeEventListener("recode:watchlist", load);
  }, []);

  const assets = entries.filter((e) => e.kind === "asset");
  const others = entries.filter((e) => e.kind !== "asset");
  const bySymbol = new Map((markets.data ?? []).map((m) => [(m.symbol ?? "").toUpperCase(), m]));

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Saved assets, wallets and contracts — stored locally in this browser. Asset columns come
          from the live verified feed.
        </p>
      </header>
      <Panel padded={false}>
        {assets.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-faint">
            No saved assets yet. Open any asset's intelligence page to add it.
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 pb-2 font-semibold">Asset</th>
                <th className="px-3 pb-2 text-right font-semibold">Price</th>
                <th className="px-3 pb-2 text-right font-semibold">24H</th>
                <th className="px-3 pb-2 text-right font-semibold">Volume</th>
                <th className="hidden px-3 pb-2 text-right font-semibold md:table-cell">Liquidity</th>
                <th className="hidden px-4 pb-2 text-right font-semibold md:table-cell">Market Cap</th>
                <th className="px-4 pb-2 text-right font-semibold">Signal</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((e) => {
                const m = bySymbol.get(e.id.toUpperCase());
                const signal =
                  m == null
                    ? "—"
                    : (m.change24hPct ?? 0) > 3 && (m.volume24h ?? 0) > 0
                      ? "Momentum"
                      : (m.change24hPct ?? 0) < -3
                        ? "Selling"
                        : "Neutral";
                return (
                  <tr key={e.id} className="row-hover border-b border-line-soft">
                    <td className="px-4 py-2.5">
                      <Link href={`/app/asset/${e.id}`} className="flex items-center gap-2.5">
                        <AssetLogo symbol={e.id} url={m?.logoUrl} size={22} />
                        <span className="font-medium">{e.id}</span>
                      </Link>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{m?.price != null ? fmtUsd(m.price) : "—"}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${changeTone(m?.change24hPct)}`}>
                      {fmtPct(m?.change24hPct)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(m?.volume24h)}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right md:table-cell">
                      {m?.liquidity != null ? fmtUsd(m.liquidity) : "Data unavailable"}
                    </td>
                    <td className="tnum hidden px-4 py-2.5 text-right md:table-cell">
                      {fmtUsd(m?.marketCap ?? m?.fdv)}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">
                      <span className={signal === "Momentum" ? "text-pos" : signal === "Selling" ? "text-neg" : "text-faint"}>
                        {signal}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          watchlistService.remove("asset", e.id);
                          setEntries(watchlistService.list());
                        }}
                        className="ml-2 text-[10px] text-faint hover:text-neg"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {others.length > 0 ? (
        <>
          <h2 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Saved wallets & contracts
          </h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-[6px] border border-line bg-panel">
            {others.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="text-[10px] uppercase text-faint">{e.kind}</span>
                <Link
                  href={e.kind === "wallet" ? `/wallet/${e.id}` : `/scanner?address=${e.id}`}
                  className="tnum flex-1 text-green hover:underline"
                >
                  {e.label}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    watchlistService.remove(e.kind, e.id);
                    setEntries(watchlistService.list());
                  }}
                  className="text-[11px] text-faint hover:text-neg"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

