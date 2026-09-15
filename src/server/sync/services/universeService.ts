import type { SyncStore } from "../store";
import type { CoinGeckoProvider } from "../providers/coingecko";

/**
 * Cross-chain RWA asset universe — per-asset discovery from CoinGecko
 * tokenized-asset categories. Complements the Robinhood Chain registry:
 * these rows carry their CoinGecko id as identity (never merged with
 * on-chain markets by symbol), a "Multi-chain" chain label, and only
 * verified provider values. Categories rotate so every category is
 * refreshed within a few cycles; 429s trigger the provider's backoff.
 */

export interface UniverseRow {
  /** CoinGecko asset id — the unique identity for universe rows. */
  id: string;
  symbol: string;
  name: string;
  category: string;
  chain: "multi-chain";
  price: number | null;
  marketCap: number | null;
  /** CoinGecko market-cap ranking (verified provider value, may be null). */
  rank: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  /** Real 7d hourly history from the provider, downsampled. */
  sparkline: number[] | null;
  updatedAt: number;
  source: "CoinGecko";
}

export interface UniverseShape {
  rows: UniverseRow[];
  updatedAt: number | null;
  /** Categories fetched so far this rotation (for status display). */
  fetchedCategories: string[];
}

const PER_CATEGORY = 50;
/**
 * Categories rotate per cycle so the full universe refreshes within
 * ~17 min. Sized to stay far under the authenticated demo plan limits
 * (30 req/min, 10k/mo): 2 calls / 5 min ≈ 720 req/mo.
 */
const CATEGORIES_PER_CYCLE = 2;
/** Ordered CoinGecko category slugs per RECODE category. */
const ROTATE_SOURCES: [string, string][] = [
  ["Tokenized Stocks", "tokenized-stock"],
  ["ETFs", "tokenized-exchange-traded-funds-etfs"],
  ["Treasuries", "tokenized-treasuries"],
  ["Bonds", "tokenized-treasury-bonds-t-bonds"],
  ["Commodities", "tokenized-commodities"],
  ["Funds", "tokenized-money-market-fund-mmfs"],
  ["Private Credit", "tokenized-private-credit"],
];

let cycle = 0;
let lastLogAt = 0;

function downsample(points: number[], max = 40): number[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export async function syncUniverse(store: SyncStore, coingecko: CoinGeckoProvider): Promise<number> {
  if (!coingecko.configured) return 0;
  const shape: UniverseShape = store.get().universe ?? { rows: [], updatedAt: null, fetchedCategories: [] };
  const now = Date.now();
  let added = 0;
  const summaries: string[] = [];
  // With an authenticated key, fetch several categories per cycle (see
  // CATEGORIES_PER_CYCLE). Failures skip to the next category.
  for (let i = 0; i < CATEGORIES_PER_CYCLE; i++) {
    const [category, slug] = ROTATE_SOURCES[cycle % ROTATE_SOURCES.length];
    cycle += 1;
    try {
      const page = await coingecko.categoryPage(slug, 1, true);
      const kept: UniverseRow[] = [];
      for (const r of page.slice(0, PER_CATEGORY)) {
        const price = r.current_price ?? null;
        const mcap = r.market_cap ?? null;
        const vol = r.total_volume ?? null;
        if (price == null && mcap == null && vol == null) continue; // nothing verified
        kept.push({
          id: r.id,
          symbol: (r.symbol ?? "").toUpperCase(),
          name: r.name ?? r.id,
          category,
          chain: "multi-chain",
          price: typeof price === "number" && Number.isFinite(price) ? price : null,
          marketCap: typeof mcap === "number" && Number.isFinite(mcap) ? mcap : null,
          rank: typeof r.market_cap_rank === "number" && Number.isFinite(r.market_cap_rank) ? r.market_cap_rank : null,
          volume24h: typeof vol === "number" && Number.isFinite(vol) ? vol : null,
          change24hPct: r.price_change_percentage_24h ?? null,
          sparkline: r.sparkline_in_7d?.price ? downsample(r.sparkline_in_7d.price) : null,
          updatedAt: now,
          source: "CoinGecko",
        });
        added += 1;
      }
      // Replace this category's rows, keep the others (stale until their turn).
      shape.rows = [...shape.rows.filter((r) => r.category !== category), ...kept];
      shape.updatedAt = now;
      if (!shape.fetchedCategories.includes(category)) {
        shape.fetchedCategories = [...shape.fetchedCategories, category];
      }
      summaries.push(`${category}=${kept.length}`);
    } catch (err) {
      // rate-limited or transient failure — previous rows stay cached
      summaries.push(`${category}=skip(${coingecko.state.lastError ?? String(err).slice(0, 60)})`);
    }
  }
  store.get().universe = shape;
  store.save();
  if (now - lastLogAt > 60_000) {
    lastLogAt = now;
    console.log(`[recode] cg-universe: ${summaries.join(" | ")} (total ${shape.rows.length} rows)`);
  }
  return added;
}