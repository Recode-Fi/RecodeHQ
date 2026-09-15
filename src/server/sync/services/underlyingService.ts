import type { SyncStore } from "../store";
import type { RobinhoodStockTokenProvider } from "../providers/robinhood";
import type { YahooProvider } from "../providers/yahoo";

/** Maps a Stock Token asset type to its underlying security classification. */
export function underlyingAssetTypeOf(assetType: string | null): string | null {
  switch (assetType) {
    case "tokenized-stock":
      return "equity";
    case "etf":
      return "etf";
    case "treasury":
      return "treasury";
    case "commodity":
      return "commodity";
    case "fund":
      return "fund";
    case "private-credit":
      return "private credit";
    default:
      return null;
  }
}

/**
 * Underlying market cap sync. For every verified Stock Token, retrieves the
 * underlying security's market capitalization: official Robinhood fundamentals
 * first (same provider family), keyless Yahoo Finance as fallback. ETFs and
 * other structures are included only when the provider exposes a value —
 * never estimated from token data.
 */
export async function syncUnderlyingMcaps(
  store: SyncStore,
  robinhood: RobinhoodStockTokenProvider,
  yahoo: YahooProvider,
  maxPerCycle: number,
  cycleIndex: number,
): Promise<number> {
  const d = store.get();
  const markets = Object.values(d.markets).filter((m) => m.verified === true && m.symbol);
  if (markets.length === 0) return 0;

  const start = (cycleIndex * maxPerCycle) % markets.length;
  const rotated = [...markets.slice(start), ...markets.slice(0, start)];
  const now = Date.now();
  let updated = 0;

  for (const market of rotated.slice(0, maxPerCycle)) {
    const symbol = market.symbol as string;
    const underlyingSymbol = market.underlyingSymbol ?? symbol;
    if (d.underlyingMcaps[market.address] && now - (d.underlyingMcaps[market.address].updatedAt ?? 0) < 300_000) {
      continue;
    }

    // primary: official Robinhood fundamentals
    let marketCap: number | null = null;
    let previousClose: number | null = null;
    let source: string | null = null;
    const rhj = await robinhood.fundamentals(underlyingSymbol);
    if (rhj && rhj.marketCap != null && rhj.marketCap > 0) {
      marketCap = rhj.marketCap;
      previousClose = rhj.previousClose;
      source = "Robinhood fundamentals";
    } else if (rhj && rhj.previousClose != null && rhj.previousClose > 0) {
      // fundamentals reachable but no market cap (funds) — previous close is
      // still a verified 24H-change reference for the token
      previousClose = rhj.previousClose;
      source = "Robinhood fundamentals (previous close)";
    } else {
      // fallback: keyless Yahoo quoteSummary (equities; funds may be absent)
      try {
        const y = await yahoo.quoteSummary(underlyingSymbol);
        if (y && y.marketCap != null && y.marketCap > 0) {
          marketCap = y.marketCap;
          source = "Yahoo Finance";
        }
      } catch {
        /* provider state already tracks the failure; stay honest */
      }
      /* previous-close fallback: Yahoo v8 chart meta (verified underlying
         previous close) — used when RHJ is unreachable, so the token's real
         24H change stays computable even during RHJ outages. */
      if (previousClose == null) {
        try {
          const chart = await yahoo.chart(underlyingSymbol, "5d", "1d");
          if (chart && chart.previousClose != null && chart.previousClose > 0) {
            previousClose = chart.previousClose;
            if (source == null) source = "Yahoo chart previous close";
          }
        } catch {
          /* provider state already tracks the failure; stay honest */
        }
      }
    }

    if (marketCap == null && previousClose == null) {
      /* diagnostic: why this market produced nothing (provider backoff,
         RHJ outage, Yahoo skip) — throttled logging for auditability */
      console.log(
        `[recode] underlying: no data for ${symbol} (rhjErr=${robinhood.state.lastError ?? "-"} yahooErr=${yahoo.state.lastError ?? "-"})`,
      );
      continue;
    }
    d.underlyingMcaps[market.address] = {
      address: market.address,
      symbol: underlyingSymbol,
      marketCap,
      previousClose,
      updatedAt: now,
      source: source || "Robinhood fundamentals",
    };
    updated += 1;
    /* incremental save: results surface progressively during long cycles
       (RHJ outages can add ~15s timeouts per market) */
    store.save();
  }
  if (updated > 0) store.save();
  return updated;
}