"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recodeService, type LiveMarketRow } from "@/services/recodeService";
import { useAsyncData } from "@/hooks/useSync";
import { EVM_ADDRESS_RE, TX_HASH_RE, fmtPct, changeTone, shortAddr } from "@/lib/format";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { SearchIcon } from "@/components/ui/icons";

interface Item { key: string; label: string; sub: string; href: string; logo?: string | null; pct?: number | null }
interface Group { title: string; items: Item[] }

const PAGES: Item[] = [
  { key: "p1", label: "Overview", sub: "Global market pulse", href: "/app" },
  { key: "p2", label: "Markets", sub: "Tokenized market overview", href: "/app/markets" },
  { key: "p3", label: "RECODE Radar", sub: "Momentum / market-cap map", href: "/app/radar" },
  { key: "p4", label: "Discover", sub: "Tokenized universe", href: "/app/discover" },
  { key: "p5", label: "Tokenized Stocks", sub: "Tokenized equities", href: "/app/stocks" },
  { key: "p6", label: "Whale Activity", sub: "Live large flows", href: "/app/whales" },
  { key: "p7", label: "Smart Money", sub: "Ranked wallets", href: "/app/smart-money" },
  { key: "p8", label: "Wallet Intelligence", sub: "Wallet analytics", href: "/app/wallets" },
  { key: "p9", label: "RECODE Scan", sub: "Contract risk analysis", href: "/app/scanner" },
  { key: "p10", label: "RECODE Signals", sub: "Unusual activity detection", href: "/app/signals" },
  { key: "p11", label: "RECODE Forecast", sub: "Observable trend profiles", href: "/app/forecast" },
  { key: "p12", label: "Transaction Explorer", sub: "Live on-chain activity", href: "/app/explorer" },
  { key: "p13", label: "Portfolio", sub: "Connected wallet holdings", href: "/app/portfolio" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: markets } = useAsyncData(() => recodeService.markets("24H"), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const assetItems: Item[] = (markets ?? [])
      .filter((m: LiveMarketRow) => {
        if (!q) return true;
        return (
          (m.symbol ?? "").toLowerCase().includes(q) ||
          (m.name ?? "").toLowerCase().includes(q) ||
          m.address.toLowerCase().includes(q)
        );
      })
      .slice(0, q ? 8 : 6)
      .map((m) => ({
        key: m.address,
        label: m.symbol ?? shortAddr(m.address),
        sub: `${m.name ?? "Tokenized asset"} · ${m.assetType}`,
        href: `/asset/${encodeURIComponent((m.symbol ?? m.address).toUpperCase())}`,
        logo: m.logoUrl,
        pct: m.change24hPct,
      }));
    const addr = query.trim();
    const walletItems: Item[] = EVM_ADDRESS_RE.test(addr)
      ? [
          { key: "w", label: shortAddr(addr), sub: "Open Wallet Intelligence", href: `/wallet/${addr.toLowerCase()}` },
          { key: "c", label: shortAddr(addr), sub: "Scan this contract", href: `/scanner?address=${addr}` },
        ]
      : [];
    const txItems: Item[] = TX_HASH_RE.test(addr)
      ? [
          {
            key: "t",
            label: shortAddr(addr, 10, 8),
            sub: "Transaction · Robinhood Chain",
            href: `https://robinhoodchain.blockscout.com/tx/${addr}`,
          },
        ]
      : [];
    const pageItems = PAGES.filter(
      (p) => !q || p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q),
    );
    const out: Group[] = [];
    if (assetItems.length) out.push({ title: "Assets", items: assetItems });
    if (walletItems.length) out.push({ title: "Wallets & Contracts", items: walletItems });
    if (txItems.length) out.push({ title: "Transactions", items: txItems });
    if (pageItems.length) out.push({ title: "Navigation", items: pageItems });
    return out;
  }, [query, markets]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    if (href.startsWith("http")) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[8px] border border-line bg-surface shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(flat.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          } else if (e.key === "Enter" && flat[cursor]) {
            go(flat[cursor].href);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon width={15} height={15} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets, wallets, contracts, transactions…"
            className="h-12 w-full bg-transparent text-[13.5px] text-text outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-faint">
              No results. Paste a 0x address or transaction hash for direct lookups.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="mb-2">
                <div className="px-3 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                  {g.title}
                </div>
                {g.items.map((item) => {
                  const idx = flat.indexOf(item);
                  return (
                    <button
                      key={g.title + item.key}
                      type="button"
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => go(item.href)}
                      className={`flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left ${
                        idx === cursor ? "bg-panel" : ""
                      }`}
                    >
                      {item.logo !== undefined ? (
                        <AssetLogo symbol={item.label} url={item.logo} size={22} />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-text">{item.label}</span>
                        <span className="block truncate text-[11px] text-faint">{item.sub}</span>
                      </span>
                      {item.pct != null ? (
                        <span className={`tnum text-[11.5px] ${changeTone(item.pct)}`}>{fmtPct(item.pct)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-faint">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span className="tnum">{markets?.length ?? 0} indexed assets · Robinhood Chain</span>
        </div>
      </div>
    </div>
  );
}

