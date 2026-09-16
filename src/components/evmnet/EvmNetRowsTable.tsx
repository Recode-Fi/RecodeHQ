"use client";

import { AssetLogo } from "@/components/ui/AssetLogo";
import { fmtPct, fmtUsd, fmtNum, shortHash, changeTone } from "@/lib/format";
import type { EvmNetChain, EvmNetMarketRow } from "@/services/evmNetService";
import { EVM_NET_NAMES } from "./EvmNetMarketsTable";

export function EvmNetRowsTable({
  rows,
  chain,
  status,
}: {
  rows: EvmNetMarketRow[];
  chain: EvmNetChain;
  status: string;
}) {
  if (status === "loading" || status === "idle") {
    return <div className="px-4 py-8 text-center text-[12.5px] text-muted">Loading {EVM_NET_NAMES[chain]} data…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12.5px] text-muted">
        {status === "unavailable"
          ? `No verified ${EVM_NET_NAMES[chain]} data available.`
          : `No tracked ${EVM_NET_NAMES[chain]} tokens yet — the engine is discovering pairs.`}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="px-4 py-2 font-medium">Token</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">24H</th>
            <th className="px-3 py-2 font-medium">Liquidity</th>
            <th className="px-3 py-2 font-medium">24H Volume</th>
            <th className="px-3 py-2 font-medium">Mkt Cap</th>
            <th className="px-3 py-2 font-medium">Txns</th>
            <th className="px-3 py-2 font-medium">DEX</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((m) => (
            <tr key={m.address} className="border-t border-line/60 hover:bg-surface/60">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <AssetLogo symbol={m.symbol} url={m.logoUrl} size={22} />
                  <div>
                    <div className="font-medium">{m.symbol ?? shortHash(m.address)}</div>
                    <div className="text-[11px] text-faint">{m.name ?? "—"}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">{m.priceUsd != null ? fmtUsd(m.priceUsd) : "—"}</td>
              <td className={`px-3 py-2.5 ${changeTone(m.change24hPct)}`}>
                {m.change24hPct != null ? fmtPct(m.change24hPct) : "—"}
              </td>
              <td className="px-3 py-2.5">{m.liquidity != null ? fmtUsd(m.liquidity) : "—"}</td>
              <td className="px-3 py-2.5">{m.volume24h != null ? fmtUsd(m.volume24h) : "—"}</td>
              <td className="px-3 py-2.5">
                {m.marketCap != null ? fmtUsd(m.marketCap) : m.fdv != null ? fmtUsd(m.fdv) : "—"}
              </td>
              <td className="px-3 py-2.5">{m.txns24h != null ? fmtNum(m.txns24h) : "—"}</td>
              <td className="px-3 py-2.5 text-muted">{m.dexId ? <span className="uppercase">{m.dexId}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}