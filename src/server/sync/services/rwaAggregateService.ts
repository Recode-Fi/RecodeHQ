import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { CoinGeckoProvider, CgMarketRow } from "../providers/coingecko";
import { RateLimitError } from "../providers/rpc";

/**
 * RWA category aggregates â€” CoinGecko (primary market-data source) with the
 * existing store as cache. RWA.xyz becomes an additional server-side source
 * when RWA_XYZ_API_URL + RWA_XYZ_API_KEY are configured (its specialty:
 * treasuries/bonds/private credit); without a key those CoinGecko categories
 * still supply the data. Only verified provider rows are summed â€” nothing
 * is estimated, and categories with no verified rows stay null (N/A).
 */

export const RWA_CATEGORY_SOURCES: Record<string, string> = {
  "Tokenized Stocks": "tokenized-stock",
  ETFs: "tokenized-exchange-traded-funds-etfs",
  Treasuries: "tokenized-treasuries",
  Bonds: "tokenized-treasury-bonds-t-bonds",
  Commodities: "tokenized-commodities",
  Funds: "tokenized-money-market-fund-mmfs",
  "Private Credit": "tokenized-private-credit",
  "Other RWAs": "__remainder__",
};

/**
 * Ordered CoinGecko category slugs per RECODE category â€” the first slug that
 * returns rows wins. Some CoinGecko taxonomies are empty (the dedicated
 * tokenized-bonds category currently has no listings), so genuine fallback
 * categories are probed before a category is declared unavailable.
 */
const CATEGORY_SLUGS: Record<string, string[]> = {
  "Tokenized Stocks": ["tokenized-stock"],
  ETFs: ["tokenized-exchange-traded-funds-etfs", "tokenized-exchange-traded-product-etps"],
  Treasuries: ["tokenized-treasuries", "tokenized-t-bills"],
  Bonds: ["tokenized-treasury-bonds-t-bonds", "tokenized-non-us-government-securities"],
  Commodities: ["tokenized-commodities"],
  Funds: ["tokenized-money-market-fund-mmfs", "tokenized-closed-end-funds-cefs"],
  "Private Credit": ["tokenized-private-credit", "tokenized-credit"],
  "Other RWAs": ["__remainder__"],
};

/** Master RWA category used to derive the "Other RWAs" remainder bucket. */
const MASTER_CATEGORY = "real-world-assets-rwa";
const MAX_PAGES = 2;
/** Fresh-deployment burst guard: new category fetches per cycle. */
const MAX_NEW_CATEGORIES_PER_CYCLE = 3;

export interface RwaCategoryAggregate {
  category: string;
  marketCap: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  /** Real 7d hourly history (pointwise-summed, downsampled) or null. */
  sparkline: number[] | null;
  assets: number | null;
  updatedAt: number;
  source: string | null;
}

export interface RwaAggregatesShape {
  updatedAt: number;
  sources: string[];
  categories: Record<string, RwaCategoryAggregate>;
}

function agg(rows: CgMarketRow[], source: string, now: number): RwaCategoryAggregate {
  const withMcap = rows.filter((r) => typeof r.market_cap === "number" && r.market_cap > 0);
  if (withMcap.length === 0) {
    return {
      category: "",
      marketCap: null,
      volume24h: null,
      change24hPct: null,
      sparkline: null,
      assets: rows.length || null,
      updatedAt: now,
      source: null,
    };
  }
  const marketCap = withMcap.reduce((a, r) => a + (r.market_cap as number), 0);
  const volume24h = rows.reduce(
    (a, r) => a + (typeof r.total_volume === "number" ? r.total_volume : 0),
    0,
  );
  // market-cap-weighted 24h change across coins that report one
  let wSum = 0;
  let w = 0;
  for (const r of withMcap) {
    const pct = r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h;
    if (typeof pct === "number" && Number.isFinite(pct)) {
      wSum += pct * (r.market_cap as number);
      w += r.market_cap as number;
    }
  }
  const change24hPct = w > 0 ? wSum / w : null;
  // real history: pointwise sum of per-coin 7d hourly sparklines (aligned length)
  const series = withMcap
    .map((r) => r.sparkline_in_7d?.price ?? null)
    .filter((s): s is number[] => Array.isArray(s) && s.length >= 100);
  let sparkline: number[] | null = null;
  if (series.length > 0) {
    const len = Math.min(...series.map((s) => s.length));
    if (len > 1) {
      const total = new Array<number>(len).fill(0);
      for (const s of series) {
        for (let i = 0; i < len; i += 1) {
          const v = s[i];
          if (Number.isFinite(v)) total[i] += v;
        }
      }
      // downsample ~168 hourly points â†’ ~56 for the card
      const step = Math.max(1, Math.floor(len / 56));
      sparkline = total.filter((_, i) => i % step === 0 || i === len - 1);
    }
  }
  return {
    category: "",
    marketCap,
    volume24h: volume24h > 0 ? volume24h : null,
    change24hPct,
    sparkline,
    assets: rows.length,
    updatedAt: now,
    source,
  };
}

async function fetchAllPages(
  cg: CoinGeckoProvider,
  category: string,
  sparkline: boolean,
): Promise<CgMarketRow[]> {
  const rows: CgMarketRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await cg.categoryPage(category, page, sparkline);
    rows.push(...batch);
    if (batch.length < 250) break;
  }
  return rows;
}

export async function syncRwaAggregates(store: SyncStore, cg: CoinGeckoProvider): Promise<number> {
  if (!cg.configured) return 0;
  const d = store.get();
  const now = Date.now();
  const prev = d.rwaAggregates;
  // keep last valid data visible while refreshing â€” never blank to zero
  const shape: RwaAggregatesShape = {
    updatedAt: prev?.updatedAt ?? now,
    sources: prev?.sources ?? [],
    categories: prev?.categories ?? {},
  };
  const idsByCategory = new Map<string, Set<string>>();
  const sources = new Set<string>(prev?.sources ?? []);
  let updated = 0;
  // CoinGecko public tier: fetch at most a few NEW categories per cycle so a
  // fresh deployment never bursts 9 calls at once (which trips the rate limit).
  // Remaining categories fill in on subsequent cycles, one batch at a time.
  let newFetches = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const [name, slug] of Object.entries(RWA_CATEGORY_SOURCES)) {
    if (name === "Other RWAs") continue;
    // freshness skip: category already synced within this interval â†’ keep it,
    // so failed/rate-limited categories are retried without wasting credits
    if (now - (prev?.categories[name]?.updatedAt ?? 0) < SYNC_CONFIG.rwaAggregatesMs * 0.9) {
      idsByCategory.set(name, new Set());
      updated += 1;
      continue;
    }
    if (newFetches >= MAX_NEW_CATEGORIES_PER_CYCLE) {
      continue; // deferred to a later cycle â€” never burst the provider
    }
    try {
      // probe the category's candidate slugs in order; first with rows wins
      let rows: CgMarketRow[] = [];
      let usedSlug = CATEGORY_SLUGS[name]?.[0] ?? slug;
      for (const candidate of CATEGORY_SLUGS[name] ?? [slug]) {
        if (candidate === "__remainder__") continue;
        rows = await fetchAllPages(cg, candidate, true);
        usedSlug = candidate;
        if (rows.length > 0) break;
      }
      if (rows.length === 0) continue;
      const categoryAgg = agg(rows, `CoinGecko:${usedSlug}`, now);
      categoryAgg.category = name;
      shape.categories[name] = categoryAgg;
      idsByCategory.set(name, new Set(rows.map((r) => r.id)));
      sources.add("COINGECKO");
      updated += 1;
      newFetches += 1;
    } catch (err) {
      // rate-limited â†’ stop the whole run now; the provider is backing off and
      // remaining categories are retried on the next cycle. Nothing is zeroed.
      if (err instanceof RateLimitError || (err instanceof Error && /HTTP 4|backing off/i.test(err.message))) {
        break;
      }
      /* other provider failure: previous values remain */
    }
    // stay well inside the public rate limit between category calls
    await sleep(2_200);
  }

  // "Other RWAs" = master RWA universe minus confidently-classified coins
  try {
    const master = await fetchAllPages(cg, MASTER_CATEGORY, true);
    if (master.length > 0) {
      const classified = new Set<string>();
      for (const set of idsByCategory.values()) {
        for (const id of set) classified.add(id);
      }
      const rest = master.filter((r) => !classified.has(r.id));
      if (rest.length > 0) {
        const otherAgg = agg(rest, `CoinGecko:${MASTER_CATEGORY}`, now);
        otherAgg.category = "Other RWAs";
        shape.categories["Other RWAs"] = otherAgg;
        sources.add("COINGECKO");
        updated += 1;
      }
    }
  } catch {
    /* previous values remain */
  }

  if (updated === 0) return 0;
  shape.updatedAt = now;
  shape.sources = [...sources];
  d.rwaAggregates = shape;
  store.save();
  return updated;
}
