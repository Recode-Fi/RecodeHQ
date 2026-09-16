"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useEvmNetMarkets } from "@/hooks/useEvmNet";
import type { EvmNetChain, EvmNetMarketRow } from "@/services/evmNetService";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip } from "@/components/ui/primitives";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";
import { EvmNetRowsTable } from "./EvmNetRowsTable";

export const EVM_NET_NAMES: Record<EvmNetChain, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Smart Chain",
  arbitrum: "Arbitrum One",
};

export function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" ? s : "syncing";
}

const SORTS = [
  { id: "volume", label: "VOLUME" },
  { id: "liquidity", label: "LIQUIDITY" },
  { id: "mcap", label: "MARKET CAP" },
  { id: "change", label: "GAINERS" },
  { id: "txns", label: "ACTIVITY" },
  { id: "new", label: "NEW PAIRS" },
] as const;

export function EvmNetMarketsTable({ chain }: { chain: EvmNetChain }) {
  const markets = useEvmNetMarkets(chain);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("volume");

  const rows = useMemo(() => {
    let out: EvmNetMarketRow[] = markets.data ?? [];
    if (sort === "new") out = out.filter((m) => m.isNew);
    if (dq.trim()) {
      const s = dq.trim().toLowerCase();
      out = out.filter(
        (m) =>
          (m.symbol ?? "").toLowerCase().includes(s) ||
          (m.name ?? "").toLowerCase().includes(s) ||
          m.address.toLowerCase().includes(s),
      );
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "mcap": return (b.marketCap ?? b.fdv ?? 0) - (a.marketCap ?? a.fdv ?? 0);
        case "change": return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
        case "liquidity": return (b.liquidity ?? 0) - (a.liquidity ?? 0);
        case "txns": return (b.txns24h ?? 0) - (a.txns24h ?? 0);
        default: return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      }
    });
    return sorted;
  }, [markets.data, dq, sort]);

  useAgentPageContext(
    {
      markets: {
        network: EVM_NET_NAMES[chain],
        rowCount: rows.length,
        rows: rows.slice(0, 10).map((r) => ({
          symbol: r.symbol, address: r.address, priceUsd: r.priceUsd,
          liquidity: r.liquidity, volume24h: r.volume24h, change24hPct: r.change24hPct, dex: r.dexId,
        })),
        dataStatus: markets.status,
      },
    },
    `${chain} markets`,
  );

  return (
    <Panel>
      <PanelHeader
        title={`${EVM_NET_NAMES[chain].toUpperCase()} MARKETS`}
        right={
          <div className="flex items-center gap-2">
            <LiveStatusBadge status={toDataStatus(markets.status)} />
            <UpdatedAgo ts={rows[0]?.updatedAt ?? null} />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol, name or contract…"
          className="w-64 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-green/60"
        />
        {SORTS.map((s) => (
          <button key={s.id} onClick={() => setSort(s.id)}>
            <Chip active={sort === s.id}>{s.label}</Chip>
          </button>
        ))}
      </div>
      <EvmNetRowsTable rows={rows} chain={chain} status={markets.status} />
    </Panel>
  );
}