/**
 * ============================================================
 * RECODE — token intelligence provenance (pure, shared)
 * ============================================================
 * Every token-intelligence metric travels with explicit source
 * metadata so the UI can render honest LIVE/STALE/UNAVAILABLE
 * states. No value is ever presented without its origin.
 */

export type IntelFreshness = "live" | "stale" | "unavailable";

export interface Provenance {
  /** Which data source produced the value (e.g. "robinhood-indexer"). */
  source: string;
  /** Which provider adapter served it (e.g. "indexer-primary" | "blockscout-fallback" | "cache"). */
  provider: string;
  /** Whether the value came from an officially verified source. */
  verified: boolean;
  /** 0..1 — 1 = official verified source; lower = derived/derived-on-unverified. */
  confidence: number;
  /** Epoch ms of the underlying data (not of this request). */
  updatedAt: number | null;
  freshness: IntelFreshness;
}

/** Source priority ladder for token intelligence (documented hierarchy). */
export const SOURCE_CONFIDENCE = {
  "official-registry": 1,
  "verified-explorer": 0.9,
  "contract-metadata": 0.8,
  "chain-indexer": 0.7,
  "external-registry": 0.5,
} as const;

export type IntelSourceKind = keyof typeof SOURCE_CONFIDENCE;

/**
 * Freshness classification for a timestamped intelligence value.
 * Explicitly separates "never received data" (unavailable) from
 * "received data but old" (stale) — stale data is never shown as live.
 */
export function freshnessOf(
  updatedAt: number | null,
  now: number,
  freshnessMs: number,
): IntelFreshness {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return "unavailable";
  return now - updatedAt <= freshnessMs ? "live" : "stale";
}

/** Builds a provenance record; validates confidence bounds (0..1). */
export function provenance(
  source: string,
  provider: string,
  kind: IntelSourceKind,
  updatedAt: number | null,
  now: number,
  freshnessMs: number,
  confidenceOverride?: number,
): Provenance {
  const confidence =
    confidenceOverride != null && Number.isFinite(confidenceOverride)
      ? Math.max(0, Math.min(1, confidenceOverride))
      : SOURCE_CONFIDENCE[kind];
  return {
    source,
    provider,
    verified: confidence >= 0.7,
    confidence: Math.round(confidence * 100) / 100,
    updatedAt,
    freshness: freshnessOf(updatedAt, now, freshnessMs),
  };
}