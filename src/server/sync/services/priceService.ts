import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { PriceFeedProvider } from "../providers/priceFeed";
import type { YahooProvider } from "../providers/yahoo";
import type { CandleTimeframe, SyncPrice } from "../types";

/** Merge confirmed price ticks into the store. */
export async function syncPrices(store: SyncStore, items: SyncPrice[]): Promise<number> {
  if (items.length === 0) return 0;
  const d = store.get();
  for (const p of items) {
    d.prices[p.address] = p;
  }
  store.save();
  return items.length;
}

/**
 * Lazy candle sync: only (address, timeframe) pairs recently requested by the
 * UI are fetched, capped per cycle so heavy history never floods the provider.
 *
 * Tier 1 — configured price feed.
 * Tier 2 — verified UNDERLYING market history (Yahoo v8 chart): the token
 *          tracks its underlying 1:1, so implied token candles = underlying
 *          OHLC x corporate-action multiplier. The freshest observed live
 *          tick (RHJ mid) is appended when newer than the last provider
 *          candle, giving a live-updating tail. Source-marked
 *          "underlying-market" — clearly distinguishable from observed ticks.
 * No candles are invented: buckets without verified provider values are
 * skipped.
 */
const YAHOO_TF_MAP: Record<CandleTimeframe, { range: string; interval: string; group: number }> = {
  "1m": { range: "1d", interval: "1m", group: 1 },
  "5m": { range: "5d", interval: "5m", group: 1 },
  "15m": { range: "1mo", interval: "15m", group: 1 },
  "30m": { range: "1mo", interval: "30m", group: 1 },
  "1h": { range: "1mo", interval: "1h", group: 1 },
  "4h": { range: "3mo", interval: "1h", group: 4 },
  "1d": { range: "1y", interval: "1d", group: 1 },
  "1w": { range: "2y", interval: "1wk", group: 1 },
};

/** Groups fine candles into coarser buckets (verified values only). */
function resample(
  candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[],
  group: number,
  bucketMs: number,
): { t: number; o: number; h: number; l: number; c: number; v: number | null }[] {
  if (group <= 1) return candles;
  const buckets = new Map<number, { t: number; o: number; h: number; l: number; c: number; v: number | null }>();
  for (const c of candles) {
    const start = Math.floor(c.t / bucketMs) * bucketMs;
    const b = buckets.get(start);
    if (!b) {
      buckets.set(start, { ...c, t: start });
    } else {
      b.h = Math.max(b.h, c.h);
      b.l = Math.min(b.l, c.l);
      b.c = c.c;
      b.v = b.v != null && c.v != null ? b.v + c.v : b.v ?? c.v;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export async function syncCandles(
  store: SyncStore,
  priceFeed: PriceFeedProvider,
  yahoo: YahooProvider,
  hotPairs: Map<string, number>,
): Promise<number> {
  const d = store.get();
  const now = Date.now();
  const entries = [...hotPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, SYNC_CONFIG.maxHotPairs);
  let updated = 0;
  for (const [key, requestedAt] of entries) {
    if (now - requestedAt > 10 * 60_000) {
      hotPairs.delete(key);
      continue;
    }
    if ((d.candles[key]?.updatedAt ?? 0) > now - SYNC_CONFIG.intervals.candlesMs) continue;
    const splitAt = key.lastIndexOf(":");
    const address = key.slice(0, splitAt);
    const tf = key.slice(splitAt + 1) as CandleTimeframe;
    const market = d.markets[address];
    const symbol = market?.symbol ?? d.prices[address]?.symbol ?? "";
    if (!symbol) continue;
    let stored = false;
    try {
      const candles = await priceFeed.candles(symbol, tf, SYNC_CONFIG.retention.maxCandles);
      if (candles.length > 0) {
        d.candles[key] = { updatedAt: now, candles, source: "price-feed" };
        stored = true;
        updated += 1;
      }
    } catch {
      /* provider backoff already tracked; fall through to the next tier */
    }
    if (stored) continue;

    /* Tier 2 — verified underlying market history (token tracks 1:1). */
    const map = YAHOO_TF_MAP[tf] ?? YAHOO_TF_MAP["1d"];
    const underlyingSymbol = market?.underlyingSymbol ?? symbol;
    try {
      const chart = await yahoo.chart(underlyingSymbol, map.range, map.interval);
      if (chart && chart.candles.length > 0) {
        const mult = market?.multiplier ?? 1;
        const bucketMs = map.group > 1 ? map.interval === "1h" ? 14_400_000 : map.group * 3_600_000 : 3_600_000;
        let scaled = chart.candles.map((c) => ({
          t: c.t,
          o: c.o * mult,
          h: c.h * mult,
          l: c.l * mult,
          c: c.c * mult,
          v: c.v,
        }));
        if (map.group > 1) scaled = resample(scaled, map.group, bucketMs);
        // live continuation: append the freshest observed mid when newer than
        // the last provider candle (never back-fills older history)
        const ticks = d.priceHistory[address] ?? [];
        const lastTick = ticks.length > 0 ? ticks[ticks.length - 1] : null;
        const lastCandle = scaled[scaled.length - 1];
        if (lastTick && lastTick.price > 0 && (!lastCandle || lastTick.t > lastCandle.t + 3_600_000)) {
          scaled.push({ t: lastTick.t, o: lastTick.price, h: lastTick.price, l: lastTick.price, c: lastTick.price, v: null });
        }
        d.candles[key] = {
          updatedAt: now,
          candles: scaled.slice(-SYNC_CONFIG.retention.maxCandles),
          source: "underlying-market",
        };
        /* Previous-close capture (tf=1d only): the second-to-last daily
           candle is the underlying's previous trading-day close (verified
           Yahoo value) — the real 24H-change reference for the tokenized
           asset. Stored without clobbering mcap; zero extra requests. */
        if (tf === "1d" && scaled.length >= 2) {
          const prevClose = scaled[scaled.length - 2].c;
          const prev = d.underlyingMcaps[address];
          d.underlyingMcaps[address] = {
            address,
            symbol: underlyingSymbol,
            marketCap: prev?.marketCap ?? null,
            previousClose: prevClose,
            updatedAt: now,
            source: prev?.source ?? "Underlying daily close (Yahoo)",
          };
        }
        updated += 1;
      }
    } catch {
      /* provider backoff already tracked; observed ticks still serve */
    }
  }
  if (updated > 0) store.save();
  return updated;
}