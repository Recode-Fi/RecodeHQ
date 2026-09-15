/**
 * ============================================================
 * RECODE — market math primitives (pure, shared, unit-tested)
 * ============================================================
 * Every function is total: invalid/missing inputs return null so
 * callers render "—" instead of inventing a value. No I/O, no
 * clock reads (timestamps are parameters → deterministic tests).
 */

/** Mid price = (bid + ask) / 2. Falls back to whichever side exists. */
export function midPrice(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null && Number.isFinite(bid) && Number.isFinite(ask)) {
    return (bid + ask) / 2;
  }
  if (bid != null && Number.isFinite(bid)) return bid;
  if (ask != null && Number.isFinite(ask)) return ask;
  return null;
}

/**
 * Relative bid/ask spread in percent, computed against the mid.
 * Returns null when either side (or the mid) is unavailable — a
 * one-sided quote has no meaningful spread.
 */
export function spreadPct(bid: number | null, ask: number | null): number | null {
  if (bid == null || ask == null) return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

/** Signed percentage change from a reference (e.g. previous close / 24h-ago tick). */
export function changePct(current: number | null, reference: number | null): number | null {
  if (current == null || reference == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(reference) || reference <= 0) return null;
  return ((current - reference) / reference) * 100;
}

/**
 * Token market cap = price × circulating supply. Only valid when a
 * finite positive supply is verified on-chain; null otherwise.
 */
export function tokenMarketCap(
  price: number | null,
  circulatingSupply: number | null,
): number | null {
  if (price == null || circulatingSupply == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(circulatingSupply)) return null;
  if (price <= 0 || circulatingSupply <= 0) return null;
  return price * circulatingSupply;
}

/**
 * Stale-data classification for a quote timestamp.
 * - no timestamp/price  → "unavailable" (never received data)
 * - within freshnessMs  → "live"
 * - older               → "stale"
 */
export function quoteFreshness(
  updatedAt: number | null,
  now: number,
  freshnessMs: number,
): "live" | "stale" | "unavailable" {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return "unavailable";
  return now - updatedAt <= freshnessMs ? "live" : "stale";
}

/**
 * Human "Updated Xs ago" label with second precision (the Robinhood
 * price API is cached server-side for ~15s, so seconds granularity
 * is honest; sub-second precision would overstate freshness).
 */
export function updatedSecondsAgo(updatedAt: number | null, now: number): string | null {
  if (updatedAt == null || !Number.isFinite(updatedAt) || updatedAt > now) return null;
  const s = Math.floor((now - updatedAt) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}