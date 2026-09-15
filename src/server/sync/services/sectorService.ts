import type { SyncStore } from "../store";
import type { YahooProvider } from "../providers/yahoo";

/**
 * Underlying-company classification sync. Fetches VERIFIED provider metadata
 * (Yahoo Finance assetProfile: sector + industry) for each market's underlying
 * ticker and caches it in the store. The RECODE sector category is derived at
 * read time via src/lib/classification.ts â€” provider names never leak to the
 * frontend. Assets without a confident provider mapping stay Unknown.
 */

export interface UnderlyingMeta {
  sector: string | null;
  industry: string | null;
  updatedAt: number;
  source: string;
}

const REFRESH_MS = 7 * 24 * 3_600_000; // classification metadata rarely changes

export async function syncSectors(
  store: SyncStore,
  yahoo: YahooProvider,
  batch: number,
  cycle: number,
): Promise<number> {
  const d = store.get();
  const now = Date.now();
  const entries = Object.values(d.markets)
    .map((m) => ({ address: m.address, symbol: m.underlyingSymbol ?? m.symbol }))
    .filter((e): e is { address: string; symbol: string } => Boolean(e.symbol));
  if (entries.length === 0) return 0;

  // rotation across cycles; skip entries with fresh metadata
  const cursor = (cycle * batch) % Math.max(entries.length, 1);
  const rotated = [...entries.slice(cursor), ...entries.slice(0, cursor)];
  let updated = 0;
  for (const entry of rotated) {
    if (updated >= batch) break;
    const existing = d.underlyingMeta[entry.address];
    if (existing && now - existing.updatedAt < REFRESH_MS) continue;
    try {
      const profile = await yahoo.assetProfile(entry.symbol);
      if (profile) {
        d.underlyingMeta[entry.address] = {
          sector: profile.sector,
          industry: profile.industry,
          updatedAt: now,
          source: "Yahoo Finance",
        };
        updated += 1;
      }
    } catch {
      /* provider backoff/404: retried on a later cycle â€” never guessed */
    }
  }
  if (updated > 0) store.save();
  return updated;
}
