"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useCallback } from "react";
import { useSolanaScanner, useDirectToken, type SolanaDirectLookupData } from "@/hooks/useSolana";
import type { SolanaScanRow } from "@/services/solanaService";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Sparkline } from "@/components/charts/Sparkline";
import { StateBlock, PanelHeader } from "@/components/kit/Kit";
import { LiveStatusBadge, UpdatedAgo } from "@/components/ui/LiveStatus";
import { Panel, Chip, Tag } from "@/components/ui/primitives";
import { changeTone, fmtPct, fmtUsd, fmtNum, shortHash, timeAgo } from "@/lib/format";
import { useAgentPageContext } from "@/components/agent/AgentContext";
import { SOLANA_ADDRESS_RE } from "@/lib/types";
import { isValidSolanaAddress } from "@/lib/base58";
import { NetworkIcon } from "@/components/ui/NetworkIcon";

/**
 * ============================================================
 * SOLANA MARKET SCANNER — live, per-token intelligence over the
 * verified Solana store: price, market cap, FDV, liquidity Δ,
 * volume Δ, 24h change, buy/sell counts + CALCULATED ratio, pair
 * age, DEX/pair, whale and smart-money activity. Sorts operate on
 * real data only; unavailable fields render "—", never 0.
 * ============================================================
 */

const SORTS = [
  { id: "volume", label: "VOLUME" },
  { id: "liquidity", label: "LIQUIDITY" },
  { id: "gainers", label: "GAINERS" },
  { id: "losers", label: "LOSERS" },
  { id: "activity", label: "ACTIVITY" },
  { id: "new", label: "NEW PAIRS" },
  { id: "whales", label: "WHALE ACTIVITY" },
  { id: "smart", label: "SMART MONEY" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

function sortRows(rows: SolanaScanRow[], sort: SortId): SolanaScanRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "volume":
      return sorted.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    case "liquidity":
      return sorted.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
    case "gainers":
      return sorted.sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity));
    case "losers":
      return sorted.sort((a, b) => (a.change24hPct ?? Infinity) - (b.change24hPct ?? Infinity));
    case "activity":
      return sorted.sort((a, b) => (b.txns24h ?? 0) - (a.txns24h ?? 0));
    case "new":
      return sorted.sort((a, b) => (b.pairAgeMs ?? Infinity) - (a.pairAgeMs ?? Infinity));
    case "whales":
      return sorted.sort((a, b) => b.whaleEvents24h - a.whaleEvents24h);
    case "smart":
      return sorted.sort((a, b) => b.smartWallets24h - a.smartWallets24h);
  }
}

export function SolanaScannerView({ initialMint }: { initialMint?: string }) {
  const scanner = useSolanaScanner();
  const [sort, setSort] = useState<SortId>("volume");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [directMint, setDirectMint] = useState<string | null>(
    initialMint && isValidSolanaAddress(initialMint) ? initialMint : null,
  );
  const [directError, setDirectError] = useState<string | null>(null);
  const direct = useDirectToken(directMint);

  /** Search action (Enter / button): mint → direct live lookup, text → table filter. */
  const submitSearch = useCallback(() => {
    const v = q.trim();
    if (!v) {
      setDirectMint(null);
      setDirectError(null);
      return;
    }
    if (isValidSolanaAddress(v)) {
      // Offline validation passed — now the live direct lookup runs.
      setDirectMint(v);
      setDirectError(null);
    } else if (SOLANA_ADDRESS_RE.test(v)) {
      // Base58-shaped but checksum-invalid: reject with zero provider calls.
      setDirectError("Invalid Solana mint address");
      setDirectMint(null);
    } else {
      // Normal text — stays a table filter; an active direct card is kept.
      setDirectError(null);
    }
  }, [q]);

  const rows = useMemo(() => {
    let out = scanner.data ?? [];
    const s = dq.trim().toLowerCase();
    if (s && !isValidSolanaAddress(s.trim())) {
      out = out.filter(
        (r) =>
          (r.symbol ?? "").toLowerCase().includes(s) || (r.name ?? "").toLowerCase().includes(s),
      );
    }
    if (sort === "gainers") out = out.filter((r) => (r.change24hPct ?? 0) > 0);
    if (sort === "losers") out = out.filter((r) => (r.change24hPct ?? 0) < 0);
    if (sort === "new") out = out.filter((r) => r.pairAgeMs != null && r.pairAgeMs <= 7 * 86_400_000);
    if (sort === "whales") out = out.filter((r) => r.whaleEvents24h > 0);
    if (sort === "smart") out = out.filter((r) => r.smartWallets24h > 0);
    return sortRows(out, sort);
  }, [scanner.data, dq, sort]);

  const newestQuote = useMemo(() => {
    let max: number | null = null;
    for (const r of scanner.data ?? []) {
      if (r.updatedAt != null && (max == null || r.updatedAt > max)) max = r.updatedAt;
    }
    return max;
  }, [scanner.data]);

  const liveCount = useMemo(
    () => (scanner.data ?? []).filter((r) => r.dataStatus === "live").length,
    [scanner.data],
  );

  useAgentPageContext(
    {
      markets: {
        network: "Solana (mainnet-beta) · Market Scanner",
        rowsShown: rows.length,
        liveQuotes: liveCount,
        activeSort: sort,
        directLookup:
          direct.state.phase === "found"
            ? {
                mint: direct.state.data.token.mint,
                symbol: direct.state.data.token.symbol,
                price: direct.state.data.token.priceUsd,
                liquidity: direct.state.data.token.liquidityUsd,
                dexId: direct.state.data.token.dexId,
                pairsTotal: direct.state.data.pairsTotal,
              }
            : null,
        top: rows.slice(0, 12).map((r) => ({
          symbol: r.symbol,
          mint: r.mint,
          price: r.price,
          change24hPct: r.change24hPct,
          volume24h: r.volume24h,
          liquidity: r.liquidity,
          buySellRatio: r.buySellRatio,
          whaleEvents24h: r.whaleEvents24h,
          smartWallets24h: r.smartWallets24h,
          dexId: r.dexId,
        })),
        dataStatus: scanner.status,
      },
    },
    `solana scanner · sort: ${sort}`,
  );

  const badgeStatus =
    scanner.status === "live"
      ? ("live" as const)
      : scanner.status === "stale"
        ? ("stale" as const)
        : scanner.status === "unavailable"
          ? ("unavailable" as const)
          : ("syncing" as const);

  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <NetworkIcon id="solana" size={22} />
          <div>
            <h1 className="text-xl font-semibold">Solana Market Scanner</h1>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted">
              Live per-token scan across tracked Solana pairs — buy/sell flow, liquidity and
              volume deltas, pair age and whale/smart-money activity. Calculated from verified
              data only; unavailable metrics show &quot;—&quot;.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveStatusBadge status={badgeStatus} label={scanner.status === "live" ? "LIVE" : undefined} />
          <UpdatedAgo ts={newestQuote} />
        </div>
      </header>

      <Panel>
        <PanelHeader
          title="Scanner"
          sub={`${rows.length} tokens · ${liveCount} live quotes`}
          right={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {SORTS.map((s) => (
                <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          }
        />
        <form
          className="mb-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search symbol/name (e.g. "BONK") or paste a Solana mint address…'
            className="tnum w-full rounded-[4px] border border-line bg-panel px-3 py-2 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-line-strong"
            spellCheck={false}
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-[4px] btn-accent px-5 text-[12.5px] font-semibold text-green"
          >
            Scan
          </button>
        </form>
        {directError ? (
          <p className="mb-2 text-[11.5px] text-neg">{directError}</p>
        ) : null}

        <DirectLookupCard state={direct.state} onClear={() => setDirectMint(null)} />

        <StateBlock
          status={badgeStatus === "unavailable" ? "unavailable" : badgeStatus === "syncing" ? "syncing" : "live"}
          loadingRows={8}
          empty={
            directMint ? (
              <p className="py-10 text-center text-[12.5px] text-faint">
                Direct lookup active — the resolved token is shown above.
              </p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-faint">
                No tracked Solana tokens match this filter — the scanner only renders verified data.
                Paste a mint address and press Scan for a direct live lookup.
              </p>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[9.5px] text-muted">
                  <th className="px-4 pb-2 text-left font-semibold uppercase tracking-[0.12em]">Token</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">Price</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">MCap</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">FDV</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">24H</th>
                  <th className="px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em]">Vol 24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Liq</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Liq Δ24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Vol Δ24H</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] md:table-cell">Buys/Sells</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] md:table-cell">Ratio</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Pair Age</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">DEX</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Whales</th>
                  <th className="hidden px-3 pb-2 text-right font-semibold uppercase tracking-[0.12em] xl:table-cell">Smart</th>
                  <th className="hidden px-4 pb-2 text-right font-semibold uppercase tracking-[0.12em] lg:table-cell">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mint} className="row-hover border-b border-line-soft">
                    <td className="px-4 py-2.5">
                      <Link href={`/app/token/${encodeURIComponent(r.mint)}`} className="flex items-center gap-2.5">
                        <AssetLogo symbol={r.symbol} url={r.logoUrl} size={22} />
                        <span>
                          <span className="flex items-center gap-1.5 font-medium">
                            {r.symbol ?? shortHash(r.mint)}
                            {r.dataStatus === "live" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-pos" title="Live quote" />
                            ) : r.dataStatus === "stale" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Stale quote" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-line" title="No verified quote yet" />
                            )}
                          </span>
                          <span className="block max-w-44 truncate text-[10.5px] text-faint">
                            {r.name ?? shortHash(r.mint, 4, 4)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.price)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{r.marketCap != null ? fmtUsd(r.marketCap) : "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right">{r.fdv != null ? fmtUsd(r.fdv) : "—"}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${changeTone(r.change24hPct)}`}>{fmtPct(r.change24hPct)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtUsd(r.volume24h)}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right lg:table-cell">
                      {r.liquidity != null ? fmtUsd(r.liquidity) : "—"}
                    </td>
                    <td className={`tnum hidden px-3 py-2.5 text-right lg:table-cell ${changeTone(r.liquidityChange24hPct)}`}>
                      {r.liquidityChange24hPct != null ? fmtPct(r.liquidityChange24hPct) : "—"}
                    </td>
                    <td className={`tnum hidden px-3 py-2.5 text-right lg:table-cell ${changeTone(r.volumeChange24hPct)}`}>
                      {r.volumeChange24hPct != null ? fmtPct(r.volumeChange24hPct) : "—"}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right md:table-cell" title="24h buys / sells (DEX pairs)">
                      {r.buys24h != null && r.sells24h != null ? `${fmtNum(r.buys24h)} / ${fmtNum(r.sells24h)}` : "—"}
                    </td>
                    <td
                      className="tnum hidden px-3 py-2.5 text-right md:table-cell"
                      title="Calculated: 24h buys ÷ sells (unavailable when sells is 0 or counts are unknown)"
                    >
                      {r.buySellRatio != null ? r.buySellRatio.toFixed(2) : "—"}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell">
                      {r.pairAgeMs != null ? timeAgo(Date.now() - r.pairAgeMs) : "—"}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right xl:table-cell">
                      <span className="text-muted">{r.dexId ?? "—"}</span>
                      {r.pairAddress ? (
                        <span className="block text-[10px] text-faint">{shortHash(r.pairAddress, 4, 4)}</span>
                      ) : null}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell" title="Verified whale events (24h)">
                      {r.whaleEvents24h > 0 ? <span className="text-warn">{r.whaleEvents24h}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="tnum hidden px-3 py-2.5 text-right xl:table-cell" title="Wallets with verified accumulation ≥ threshold (24h)">
                      {r.smartWallets24h > 0 ? <span className="text-pos">{r.smartWallets24h}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right lg:table-cell">
                      {r.sparkline?.length > 1 ? <Sparkline points={r.sparkline} width={72} height={22} /> : <span className="text-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateBlock>
      </Panel>
      <p className="text-[10.5px] text-faint">
        Buy/sell ratio is calculated from verified 24h pair transactions; liquidity/volume deltas
        compare the current quote with the engine&apos;s own stored observation ≥ 24h old (null
        until history exists). Whale and smart-money counts come from verified largest-account
        balance deltas on Solana RPC — never modeled, never substituted.
      </p>
    </div>
  );
}

/* ── Direct mint lookup result ───────────────────────────── */

function LookupRow({ k, v, cls = "" }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${cls}`}>{v}</dd>
    </div>
  );
}

export function DirectLookupCard({
  state,
  onClear,
}: {
  state: ReturnType<typeof useDirectToken>["state"];
  onClear: () => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "resolving") {
    return (
      <div className="mb-3 rounded-[6px] border border-line bg-panel px-4 py-3 text-[12.5px] text-muted">
        <span className="live-dot" /> Resolving Solana token…
      </div>
    );
  }
  if (state.phase === "invalid") {
    return (
      <div className="mb-3 rounded-[6px] border border-neg/30 bg-neg/10 px-4 py-3 text-[12.5px] text-neg">
        Invalid Solana mint address
        <button type="button" onClick={onClear} className="ml-3 text-faint hover:text-text">
          dismiss
        </button>
      </div>
    );
  }
  if (state.phase === "no-market") {
    return (
      <div className="mb-3 rounded-[6px] border border-warn/30 bg-warn/10 px-4 py-3 text-[12.5px] text-warn">
        Solana mint found, but no verified market pair is currently available.
        <span className="ml-2 text-faint">
          {state.metadata?.symbol ? `(${state.metadata.symbol})` : ""}
        </span>
        <button type="button" onClick={onClear} className="ml-3 text-faint hover:text-text">
          dismiss
        </button>
      </div>
    );
  }
  if (state.phase === "not-found") {
    return (
      <div className="mb-3 rounded-[6px] border border-warn/30 bg-warn/10 px-4 py-3 text-[12.5px] text-warn">
        Token not found or unavailable from current providers.
        <button type="button" onClick={onClear} className="ml-3 text-faint hover:text-text">
          dismiss
        </button>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="mb-3 rounded-[6px] border border-neg/30 bg-neg/10 px-4 py-3 text-[12.5px] text-neg">
        {state.message}
        <button type="button" onClick={onClear} className="ml-3 text-faint hover:text-text">
          dismiss
        </button>
      </div>
    );
  }
  if (state.phase === "found") {
    return <DirectLookupFound data={state.data} onClear={onClear} />;
  }
  return null;
}

function DirectLookupFound({
  data,
  onClear,
}: {
  data: SolanaDirectLookupData;
  onClear: () => void;
}) {
  const t = data.token;
  const ratio =
    t.buys24h != null && t.sells24h != null && t.sells24h > 0 ? t.buys24h / t.sells24h : null;
  return (
    <div className="mb-3 rounded-[6px] border border-green/30 bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AssetLogo symbol={t.symbol} url={t.logoUrl} size={36} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold">{t.symbol ?? "—"}</span>
              <Tag>Solana · direct lookup</Tag>
              <Link
                href={`/app/token/${encodeURIComponent(t.mint)}`}
                className="text-[11.5px] text-green hover:underline"
              >
                Full intelligence →
              </Link>
            </div>
            <p className="mt-0.5 text-[11.5px] text-muted">{t.name ?? "Token name unavailable"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`tnum text-[16px] font-semibold ${changeTone(t.change24hPct)}`}>
            {fmtPct(t.change24hPct)} 24H
          </span>
          <button type="button" onClick={onClear} className="text-faint hover:text-text" title="Clear">
            ✕
          </button>
        </div>
      </div>

      <dl className="tnum mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
        <LookupRow k="Price" v={fmtUsd(t.priceUsd)} />
        <LookupRow k="Market Cap" v={t.marketCap != null ? fmtUsd(t.marketCap) : "Data unavailable"} />
        <LookupRow k="FDV" v={t.fdv != null ? fmtUsd(t.fdv) : "—"} />
        <LookupRow k="Liquidity" v={t.liquidityUsd != null ? fmtUsd(t.liquidityUsd) : "Data unavailable"} />
        <LookupRow k="24H Volume" v={t.volume24hUsd != null ? fmtUsd(t.volume24hUsd) : "Data unavailable"} />
        <LookupRow
          k="Buys / Sells"
          v={t.buys24h != null && t.sells24h != null ? `${fmtNum(t.buys24h)} / ${fmtNum(t.sells24h)}` : "—"}
        />
        <LookupRow k="Buy/Sell Ratio" v={ratio != null ? ratio.toFixed(2) : "—"} />
        <LookupRow k="Activity 24H" v={t.txns24h != null ? fmtNum(t.txns24h) : "—"} />
        <LookupRow k="DEX" v={t.dexId ?? "—"} />
        <LookupRow k="Pair Age" v={t.pairCreatedAt != null ? timeAgo(t.pairCreatedAt) : "—"} />
        <LookupRow k="Supply" v={t.supply != null ? fmtNum(t.supply) : "—"} />
        <LookupRow k="Holders" v={<span className="text-faint">—</span>} />
        <LookupRow
          k="Top-10 concentration"
          v={data.concentration.top10 != null ? `${data.concentration.top10.toFixed(1)}%` : "Data unavailable"}
        />
        <LookupRow k="Quote token" v={data.pairs[0]?.quoteToken ?? "—"} />
        <LookupRow k="Whale events (24h)" v={<span className="text-faint">{data.whales.length}</span>} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-faint">Mint:</span>
        <code className="tnum break-all rounded-[4px] border border-line bg-panel-2 px-2 py-1">
          {t.mint}
        </code>
        <a
          href={`https://solscan.io/token/${t.mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green hover:underline"
        >
          Solscan ↗
        </a>
        {t.pairAddress ? (
          <a
            href={`https://solscan.io/account/${t.pairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green hover:underline"
          >
            Pair ↗
          </a>
        ) : null}
      </div>

      {data.pairsTotal > 1 ? (
        <div className="mt-3 border-t border-line-soft pt-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Markets ({data.pairsTotal} pairs — primary is the most liquid; metrics are never merged)
          </p>
          <ul className="tnum space-y-1 text-[11.5px]">
            {data.pairs.slice(0, 5).map((p, i) => (
              <li key={`${p.pairAddress ?? i}`} className="flex items-center justify-between gap-3">
                <span className="text-muted">
                  {i === 0 ? <span className="mr-1.5 text-green">Primary</span> : null}
                  {p.dexId ?? "unknown"} {p.pairAddress ? `· ${shortHash(p.pairAddress, 4, 4)}` : ""}
                  {p.quoteToken ? ` · ${p.quoteToken}` : ""}
                </span>
                <span className="flex gap-4">
                  <span>{p.liquidityUsd != null ? fmtUsd(p.liquidityUsd) : "—"}</span>
                  <span className="w-20 text-right text-faint">
                    {p.volume24hUsd != null ? fmtUsd(p.volume24hUsd) : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.errors.length > 0 ? (
        <p className="mt-3 text-[10.5px] text-faint">{data.errors.join(" · ")}</p>
      ) : null}
      <p className="mt-2 text-[10.5px] text-faint">
        {data.priceBasis ?? "Price basis unavailable"} · resolved live on search — never cached as
        demo data
      </p>
    </div>
  );
}