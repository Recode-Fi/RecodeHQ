"use client";

import { useEffect, useState } from "react";
import { recodeService } from "@/services/recodeService";
import type { LiveUniverseRow } from "@/services/recodeService";
import { Sparkline } from "@/components/charts/Sparkline";
import { PanelHeader } from "@/components/kit/Kit";
import { Panel, Chip } from "@/components/ui/primitives";
import { fmtUsd, fmtPct, fmtNum, changeTone } from "@/lib/format";

const CATEGORIES = ["All", "Tokenized Stocks", "ETFs", "Treasuries", "Bonds", "Commodities", "Funds", "Private Credit"];

/**
 * Cross-chain RWA universe — per-asset rows discovered via CoinGecko
 * tokenized-asset categories. Identity is the provider asset id (never
 * merged with Robinhood Chain markets by symbol). Display-only rows:
 * they carry no contract address, so they deliberately link nowhere.
 */
export function UniverseSection() {
  const [rows, setRows] = useState<LiveUniverseRow[] | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "unavailable">("loading");
  const [cat, setCat] = useState("All");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await recodeService.universe();
      if (!alive) return;
      if (res.status === "live" && res.data) {
        setRows(res.data);
        setStatus("live");
      } else {
        setStatus("unavailable");
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const visible = (rows ?? []).filter((r) => cat === "All" || r.category === cat).slice(0, 60);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PanelHeader
        title="RWA Universe"
        sub="Cross-chain tokenized-asset discovery — verified market data from CoinGecko. Not necessarily on Robinhood Chain."
      />
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
          {status === "live" ? (
            <span className="ml-auto flex items-center gap-1.5 text-[9.5px] uppercase tracking-wider text-green">
              <span className="live-dot" /> {visible.length} assets
            </span>
          ) : null}
        </div>
        {status !== "live" ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-faint">
            {status === "loading"
              ? "Loading RWA universe…"
              : "RWA universe discovery has not returned data yet. Verified rows appear here automatically — none are estimated."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 pb-2 font-semibold">Asset</th>
                  <th className="hidden px-3 pb-2 font-semibold md:table-cell">Rank</th>
                  <th className="px-3 pb-2 font-semibold">Category</th>
                  <th className="px-3 pb-2 text-right font-semibold">Price</th>
                  <th className="px-3 pb-2 text-right font-semibold">24H</th>
                  <th className="px-3 pb-2 text-right font-semibold">Market Cap</th>
                  <th className="px-3 pb-2 text-right font-semibold">Volume 24H</th>
                  <th className="hidden px-4 pb-2 text-right font-semibold lg:table-cell">7D Trend</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="row-hover border-b border-line-soft">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-panel-2 text-[9px] font-bold text-muted">
                          {(r.symbol ?? r.id).slice(0, 3)}
                        </span>
                        <span>
                          <span className="font-medium">{r.symbol ?? r.id}</span>
                          <span className="block max-w-56 truncate text-[10.5px] text-faint">{r.name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-muted md:table-cell">
                      {r.rank != null ? `#${fmtNum(r.rank)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted">{r.category}</td>
                    <td className="tnum px-3 py-2.5 text-right">{r.price != null ? fmtUsd(r.price) : "—"}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${changeTone(r.change24hPct)}`}>
                      {fmtPct(r.change24hPct)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.marketCap)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.volume24h)}</td>
                    <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                      {r.sparkline && r.sparkline.length > 1 ? (
                        <Sparkline points={r.sparkline} width={72} height={22} />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {status === "live" ? (
          <div className="px-4 py-2.5 text-[10.5px] text-faint">
            Identity: provider asset id (rows are never merged into Robinhood Chain markets by symbol) ·
            values verified from the provider at {rows?.[0]?.updatedAt ? new Date(rows[0].updatedAt).toLocaleTimeString("en", { hour12: false }) : "—"}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}