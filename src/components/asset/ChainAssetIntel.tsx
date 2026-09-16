"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge } from "@/components/ui/LiveStatus";
import { Panel } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import type { DataStatus } from "@/lib/types";

/**
 * CHAIN ASSET INTELLIGENCE — shared selector + live-detail surface,
 * parameterized by the selected network's verified market rows. Each
 * network (Solana, Arc, …) maps its own row type to ChainAssetRow;
 * no cross-chain substitution ever occurs.
 */

export interface ChainAssetRow {
  id: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  txns24h: number | null;
  dexLabel: string | null;
  detailHref: string;
  sources: string[];
}

function toDataStatus(s: string): DataStatus {
  return s === "live" || s === "stale" || s === "unavailable" ? s : "syncing";
}

export function ChainAssetIntel({
  networkId,
  networkName,
  rows,
  status,
  emptyNote,
  subtitle,
}: {
  networkId: string;
  networkName: string;
  rows: ChainAssetRow[];
  status: string;
  emptyNote: string;
  subtitle: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.symbol ?? "").toLowerCase().includes(s) ||
        (r.name ?? "").toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s),
    );
  }, [rows, q]);

  const selected = filtered.find((r) => r.id === sel) ?? null;

  useAgentPageContext(
    {
      asset: {
        network: networkName,
        universeSize: filtered.length,
        selected: selected
          ? {
              symbol: selected.symbol,
              id: selected.id,
              priceUsd: selected.priceUsd,
              liquidity: selected.liquidity,
              volume24h: selected.volume24h,
              change24hPct: selected.change24hPct,
            }
          : null,
        dataStatus: status,
      },
    },
    `${networkId} asset intelligence`,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Panel>
        <PanelHeader
          title={`${networkName} assets`}
          right={<LiveStatusBadge status={toDataStatus(status)} />}
        />
        <div className="px-4 pb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol, name or address…"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-green/60"
          />
        </div>
        <ul className="max-h-[560px] divide-y divide-line/60 overflow-y-auto">
          {filtered.slice(0, 120).map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSel(r.id)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[12.5px] hover:bg-surface/60 ${sel === r.id ? "bg-surface" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <AssetLogo symbol={r.symbol} url={r.logoUrl} size={20} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.symbol ?? shortHash(r.id)}</span>
                    <span className="block text-[11px] text-faint">{r.name ?? "—"}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block">{r.priceUsd != null ? fmtUsd(r.priceUsd) : "—"}</span>
                  <span className={`block text-[11px] ${changeTone(r.change24hPct)}`}>
                    {r.change24hPct != null ? fmtPct(r.change24hPct) : "—"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-[12.5px] text-muted">{emptyNote}</li>
          ) : null}
        </ul>
      </Panel>
      <ChainDetail networkId={networkId} networkName={networkName} selected={selected} />
    </div>
  );
}

function ChainDetail({
  networkId,
  networkName,
  selected,
}: {
  networkId: string;
  networkName: string;
  selected: ChainAssetRow | null;
}) {
  if (!selected) {
    return (
      <Panel>
        <div className="px-4 py-16 text-center text-[12.5px] text-muted">
          Select a {networkName} token to view its live intelligence.
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelHeader
        title={selected.symbol ?? shortHash(selected.id)}
        sub={selected.name ?? undefined}
        right={
          <Link href={selected.detailHref} className="text-[12px] text-green hover:underline">
            Full intelligence →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4 text-[12.5px] md:grid-cols-4">
        <Stat label="Price" value={selected.priceUsd != null ? fmtUsd(selected.priceUsd) : "—"} />
        <Stat
          label="Market Cap"
          value={
            selected.marketCap != null
              ? fmtUsd(selected.marketCap)
              : selected.fdv != null
                ? fmtUsd(selected.fdv)
                : "—"
          }
        />
        <Stat label="Liquidity" value={selected.liquidity != null ? fmtUsd(selected.liquidity) : "—"} />
        <Stat label="24H Volume" value={selected.volume24h != null ? fmtUsd(selected.volume24h) : "—"} />
        <Stat
          label="24H"
          value={selected.change24hPct != null ? fmtPct(selected.change24hPct) : "—"}
          tone={changeTone(selected.change24hPct)}
        />
        <Stat label="Txns 24H" value={selected.txns24h != null ? fmtNum(selected.txns24h) : "—"} />
        <Stat label="Market / DEX" value={selected.dexLabel ?? "—"} />
        <Stat label={networkId === "solana" ? "Mint" : "Contract"} value={selected.id} mono />
      </div>
      <div className="px-4 pb-4 text-[11px] text-faint">
        Sources: {selected.sources.join(", ") || networkName} · data from the {networkName}{" "}
        intelligence layer only (never mixed with other chains).
      </div>
    </Panel>
  );
}

function Stat({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`${mono ? "font-mono text-[11.5px]" : ""} ${tone ?? ""}`}>{value}</div>
    </div>
  );
}