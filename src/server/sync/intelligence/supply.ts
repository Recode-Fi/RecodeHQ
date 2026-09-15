/**
 * ============================================================
 * RECODE — verified supply resolver (pure, deterministic)
 * ============================================================
 * Explicit supply-source hierarchy. Every result carries source,
 * verified flag, confidence and updatedAt. The resolver picks the
 * FIRST candidate in the declared priority that yields a usable
 * total supply:
 *
 *   1. official-registry   — official token registry / verified
 *                            source (admin-verified explorer registry)
 *   2. verified-explorer   — verified explorer token metadata
 *   3. contract-metadata   — verified contract metadata (RPC reads)
 *   4. chain-indexer       — chain/indexer total supply
 *   5. external-registry   — trusted external registry
 *   6. unavailable
 *
 * CRITICAL RULE: total supply is NEVER labeled as circulating supply.
 * circulatingSupply is only set when a VERIFIED circulating figure
 * (or a verified circulating market cap that can be divided by the
 * verified price) exists — otherwise null.
 */

import type { IntelSourceKind, Provenance } from "./provenance";

/** Priority order — index 0 is most trusted. */
export const SUPPLY_PRIORITY: IntelSourceKind[] = [
  "official-registry",
  "verified-explorer",
  "chain-indexer",
  "external-registry",
];

export interface SupplyCandidate {
  /** Which source kind this candidate represents. */
  kind: IntelSourceKind;
  /** Human source label (travels to the UI). */
  source: string;
  /** Raw on-chain supply string (hex or decimal), normalized with decimals. */
  totalSupplyRaw?: string | null;
  /** Pre-normalized total supply (whole tokens), when the source gives it. */
  totalSupply?: number | null;
  /** Verified circulating supply when the source provides one. */
  circulatingSupply?: number | null;
  /** Verified circulating market cap — enables a derived circulating supply. */
  circulatingMarketCap?: number | null;
  decimals?: number | null;
  /** When this candidate was captured. */
  updatedAt: number;
}

export interface SupplyResult {
  totalSupply: number | null;
  /** NEVER a relabeled total supply — null when unverified. */
  circulatingSupply: number | null;
  source: string | null;
  kind: IntelSourceKind | null;
  verified: boolean;
  confidence: number;
  updatedAt: number | null;
  /** How circulating was derived (for UI transparency). */
  circulatingBasis: string | null;
  provenance: Provenance;
}

/** Normalizes a raw supply string using token decimals (defaults 18). */
export function normalizeSupplyRaw(raw: string | null, decimals: number | null): number | null {
  if (!raw) return null;
  try {
    const big = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    const n = Number(big);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 10 ** (decimals ?? 18);
  } catch {
    return null;
  }
}

const KIND_CONFIDENCE: Record<IntelSourceKind, number> = {
  "official-registry": 1,
  "verified-explorer": 0.9,
  "contract-metadata": 0.8,
  "chain-indexer": 0.7,
  "external-registry": 0.5,
};

/**
 * Resolves supply from candidates following the priority ladder.
 * Candidates of the same kind keep their input order (first wins).
 */
export function resolveSupply(
  candidates: SupplyCandidate[],
  price: number | null,
  now: number,
): SupplyResult {
  const ranked = [...candidates]
    .filter((c) => c != null)
    .sort((a, b) => SUPPLY_PRIORITY.indexOf(a.kind) - SUPPLY_PRIORITY.indexOf(b.kind));

  for (const c of ranked) {
    const total =
      c.totalSupply != null && Number.isFinite(c.totalSupply) && c.totalSupply > 0
        ? c.totalSupply
        : normalizeSupplyRaw(c.totalSupplyRaw ?? null, c.decimals ?? null);
    if (total == null) continue;

    // Circulating: only from an explicitly verified circulating figure,
    // or derived from a VERIFIED circulating market cap ÷ verified price.
    let circulating: number | null = null;
    let circulatingBasis: string | null = null;
    if (
      c.circulatingSupply != null &&
      Number.isFinite(c.circulatingSupply) &&
      c.circulatingSupply > 0
    ) {
      circulating = c.circulatingSupply;
      circulatingBasis = `verified circulating supply from ${c.source}`;
    } else if (
      c.circulatingMarketCap != null &&
      Number.isFinite(c.circulatingMarketCap) &&
      c.circulatingMarketCap > 0 &&
      price != null &&
      Number.isFinite(price) &&
      price > 0
    ) {
      circulating = c.circulatingMarketCap / price;
      circulatingBasis = `derived: verified circulating market cap ÷ verified price (${c.source})`;
    }

    const confidence = KIND_CONFIDENCE[c.kind];
    return {
      totalSupply: total,
      circulatingSupply: circulating,
      source: c.source,
      kind: c.kind,
      verified: confidence >= 0.7,
      confidence,
      updatedAt: c.updatedAt,
      circulatingBasis,
      provenance: {
        source: c.source,
        provider: "supply-resolver",
        verified: confidence >= 0.7,
        confidence,
        updatedAt: c.updatedAt,
        freshness: "live",
      },
    };
  }

  return {
    totalSupply: null,
    circulatingSupply: null,
    source: null,
    kind: null,
    verified: false,
    confidence: 0,
    updatedAt: null,
    circulatingBasis: null,
    provenance: {
      source: "unavailable",
      provider: "supply-resolver",
      verified: false,
      confidence: 0,
      updatedAt: null,
      freshness: "unavailable",
    },
  };
}

/**
 * FDV = currentPrice × verified totalSupply. Null unless both sides
 * are verified — never fabricated, never substituted for market cap.
 */
export function fdvOf(price: number | null, totalSupply: number | null): number | null {
  if (price == null || totalSupply == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(totalSupply)) return null;
  if (price <= 0 || totalSupply <= 0) return null;
  return price * totalSupply;
}

/**
 * Token market cap = price × VERIFIED circulating supply only.
 * Total supply is never substituted here.
 */
export function marketCapFromCirculating(
  price: number | null,
  circulatingSupply: number | null,
): number | null {
  if (price == null || circulatingSupply == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(circulatingSupply)) return null;
  if (price <= 0 || circulatingSupply <= 0) return null;
  return price * circulatingSupply;
}