/**
 * ============================================================
 * RECODE — whale intelligence math (pure, deterministic)
 * ============================================================
 * Whale USD values are ALWAYS computed internally from raw
 * on-chain holder balances × verified current token price:
 *
 *   whaleUsd = holderTokenBalance × verifiedCurrentTokenPrice
 *
 * Rules:
 *   - If EITHER balance or price is unavailable → null (never a
 *     zero, never a pre-calculated provider value).
 *   - Concentration = sum of VERIFIED holder share percentages for
 *     the top-N holders; null when no shares are verified, with a
 *     `coverage` count of how many of the top-N actually had shares.
 *   - Flows are computed from raw on-chain transfers classified as
 *     buy/sell/transfer; only transfers with a verified USD value ≥
 *     the configured threshold count. Inflow/outflow/net:
 *       inflow  = Σ usd of whale BUYs in the window
 *       outflow = Σ usd of whale SELLs in the window
 *       net     = inflow − outflow
 *   - Same inputs → same outputs. No randomness, no clock reads
 *     (time windows are parameters).
 */

export interface HolderEntry {
  address: string | null;
  /** Normalized token balance (whole tokens). */
  balance: number | null;
  /** Verified share of supply in percent. */
  sharePct: number | null;
}

export interface WhaleExposure {
  /** Σ balance×price over holders whose computed USD ≥ threshold. */
  usd: number | null;
  /** How many holders crossed the threshold. */
  count: number;
  /** Top holders by USD value (largest first), each with computed USD. */
  largest: { address: string | null; balance: number | null; usd: number }[];
  provenance: { derivedFrom: string; thresholdUsd: number };
}

export interface WhaleFlows {
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  /** Whale-size transfers counted in the window. */
  transferCount: number;
  basis: string;
}

/**
 * Whale USD for one holder. Null whenever the balance or the price is
 * missing/invalid — the absence of data must never read as $0.
 */
export function whaleUsd(
  balance: number | null,
  price: number | null,
): number | null {
  if (balance == null || price == null) return null;
  if (!Number.isFinite(balance) || !Number.isFinite(price)) return null;
  if (balance <= 0 || price <= 0) return null;
  return balance * price;
}

/**
 * Top-N holder concentration in percent of supply. Entries without a
 * verified sharePct are excluded from the sum (and from `coverage`);
 * returns null only when NO share is verified at all.
 */
export function holderConcentration(
  entries: HolderEntry[],
  n: number,
): { value: number; coverage: number } | null {
  const shares = entries
    .slice(0, n)
    .map((e) => e.sharePct)
    .filter((s): s is number => s != null && Number.isFinite(s) && s >= 0);
  if (shares.length === 0) return null;
  return {
    value: Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100,
    coverage: shares.length,
  };
}

/** Known burn/null addresses — never classified as whales. */
export const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000001",
]);

export function isBurnAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return BURN_ADDRESSES.has(address.toLowerCase());
}

/**
 * Whale exposure across the known top holders: largest balances first,
 * USD computed per holder, exposure = Σ over holders ≥ threshold.
 * Burn/null addresses are excluded — they hold supply, not wealth.
 */
export function whaleExposure(
  entries: HolderEntry[],
  price: number | null,
  thresholdUsd: number,
): WhaleExposure {
  const largest: WhaleExposure["largest"] = [];
  for (const e of entries) {
    if (isBurnAddress(e.address)) continue; // burned supply is not a whale
    const usd = whaleUsd(e.balance, price);
    if (usd != null) largest.push({ address: e.address, balance: e.balance, usd });
  }
  largest.sort((a, b) => b.usd - a.usd);
  const above = largest.filter((h) => h.usd >= thresholdUsd);
  return {
    usd: above.length > 0 ? above.reduce((a, h) => a + h.usd, 0) : null,
    count: above.length,
    largest,
    provenance: { derivedFrom: "verified holder balances × verified token price", thresholdUsd },
  };
}

export interface FlowTx {
  ts: number;
  /** buy | sell | transfer */
  action: string;
  /** Verified USD value of the transfer. */
  usd: number | null;
}

/**
 * Whale flows from raw on-chain transfers over a time window.
 * Only transfers with a VERIFIED usd ≥ threshold count — a missing usd
 * is skipped entirely, never assumed to be zero.
 */
export function whaleFlows(
  txs: FlowTx[],
  now: number,
  windowMs: number,
  thresholdUsd: number,
): WhaleFlows | null {
  const cutoff = now - windowMs;
  let inflow = 0;
  let outflow = 0;
  let count = 0;
  for (const t of txs) {
    if (t.ts < cutoff) continue;
    if (t.usd == null || !Number.isFinite(t.usd) || t.usd < thresholdUsd) continue;
    count += 1;
    if (t.action === "buy") inflow += t.usd;
    else if (t.action === "sell") outflow += t.usd;
  }
  if (count === 0) return null;
  return {
    inflowUsd: Math.round(inflow * 100) / 100,
    outflowUsd: Math.round(outflow * 100) / 100,
    netUsd: Math.round((inflow - outflow) * 100) / 100,
    transferCount: count,
    basis: `On-chain transfers ≥ $${thresholdUsd.toLocaleString("en")} within the last ${Math.round(windowMs / 3_600_000)}h (USD = balance × verified price)`,
  };
}