import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { CandleTimeframe, SyncCandle } from "../types";

/**
 * Builds OHLCV candles from *observed* price ticks recorded by the live sync
 * engine (d.priceHistory — real Robinhood/Blockscout prices, 7-day retention)
 * and real on-chain transaction volume (d.transactions).
 *
 * No values are invented: a candle only exists if at least one verified tick
 * was observed inside its bucket. Candle volume is the sum of verified
 * on-chain transfer USD inside the bucket, or null when none were captured.
 */
const TF_MS: Record<CandleTimeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

export function aggregateCandles(
  store: SyncStore,
  address: string,
  tf: CandleTimeframe,
): SyncCandle[] {
  const d = store.get();
  const ticks = d.priceHistory[address] ?? [];
  if (ticks.length < 2) return [];
  const bucketMs = TF_MS[tf] ?? TF_MS["1h"];
  const buckets = new Map<
    number,
    { o: number; h: number; l: number; c: number; n: number }
  >();
  for (const tick of ticks) {
    if (tick.price == null || !Number.isFinite(tick.price) || tick.price <= 0) continue;
    const start = Math.floor(tick.t / bucketMs) * bucketMs;
    const b = buckets.get(start);
    if (!b) {
      buckets.set(start, { o: tick.price, h: tick.price, l: tick.price, c: tick.price, n: 1 });
    } else {
      b.h = Math.max(b.h, tick.price);
      b.l = Math.min(b.l, tick.price);
      b.c = tick.price;
      b.n += 1;
    }
  }
  if (buckets.size === 0) return [];
  // real on-chain transfer volume per bucket (null when nothing was captured)
  const volumeByBucket = new Map<number, number>();
  let hasVolume = false;
  for (const tx of d.transactions) {
    if (tx.address !== address || tx.usd == null || !Number.isFinite(tx.usd)) continue;
    const start = Math.floor(tx.ts / bucketMs) * bucketMs;
    if (!buckets.has(start)) continue;
    volumeByBucket.set(start, (volumeByBucket.get(start) ?? 0) + tx.usd);
    hasVolume = true;
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({
      t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: hasVolume ? volumeByBucket.get(t) ?? 0 : null,
    }));
}

/** Candles whose last bucket is older than this are considered stale. */
export function candleFreshnessMs(): number {
  return Math.max(SYNC_CONFIG.priceFreshnessMs, SYNC_CONFIG.intervals.priceMs * 4);
}
