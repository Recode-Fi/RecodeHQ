/**
 * Server-side sync engine configuration.
 * Everything is env-driven; without providers the engine runs in standby
 * and the store stays empty â€” no values are ever fabricated.
 */
function str(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/$/, "") : null;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Alchemy key (server-side) → ready-to-use Robinhood Chain RPC endpoint. */
function alchemyRpc(): string | null {
  const key = str("ALCHEMY_API_KEY");
  return key ? `https://robinhood-mainnet.g.alchemy.com/v2/${key}` : null;
}

export const SYNC_CONFIG = {
  chainId: num("RECODE_CHAIN_ID", 4663),
  /** EVM JSON-RPC endpoint. Prefers RECODE_RPC_URL, then ALCHEMY_RPC_URL, then Alchemy key. */
  rpcUrl: str("RECODE_RPC_URL") ?? str("ALCHEMY_RPC_URL") ?? alchemyRpc(),
  indexerUrl: str("RECODE_INDEXER_URL"),
  /**
   * Goldsky hosted-subgraph GraphQL endpoint (Robinhood Chain mainnet is
   * officially supported by Goldsky). When set, it is the PRIMARY token
   * intelligence provider for holders/transfers; RECODE_INDEXER_URL
   * becomes secondary and Blockscout stays the final fallback.
   * Example: https://api.goldsky.com/api/public/project_<id>/subgraphs/<name>/<version>/gn
   */
  goldskySubgraphUrl: str("RECODE_GOLDSKY_SUBGRAPH_URL"),
  priceFeedUrl: str("RECODE_PRICE_FEED_URL"),
  marketListUrl: str("RECODE_MARKET_LIST_URL"),
  /** Robinhood Chain explorer (Blockscout) â€” verified live indexer. */
  blockscoutUrl: str("RECODE_BLOCKSCOUT_URL") ?? "https://robinhoodchain.blockscout.com",
  /** Official Robinhood Stock Token API (may be network-restricted). */
  robinhoodApiUrl: str("RECODE_ROBINHOOD_API_URL") ?? "https://api.robinhood.com/rhj",
  /** Keyless underlying market-cap fallback (cookie+crumb bootstrap). */
  yahooUrl: str("RECODE_YAHOO_URL") ?? "https://query1.finance.yahoo.com/v10",
  yahooSeedUrl: str("RECODE_YAHOO_SEED_URL") ?? "https://fc.yahoo.com",
  yahooCrumbUrl: str("RECODE_YAHOO_CRUMB_URL") ?? "https://query1.finance.yahoo.com/v1/test/getcrumb",
  /** Keyless per-symbol asset-logo fallback (official asset CDN stays primary). */
  logoBaseUrl: str("RECODE_LOGO_BASE_URL") ?? "https://assets.parqet.com/logos/symbol",
  /** CoinGecko public API â€” RWA category aggregates (key optional, server-side). */
  coingeckoUrl: str("RECODE_COINGECKO_URL") ?? "https://api.coingecko.com/api/v3",
  /** CoinGecko demo/pro key (server-side only, never NEXT_PUBLIC_*). Empty = keyless. */
  coingeckoApiKey: str("COINGECKO_API_KEY"),
  /** RWA.xyz institutional API â€” optional upgrade for treasury/bond/credit data. */
  rwaXyzUrl: str("RWA_XYZ_API_URL"),
  /** RWA category aggregates refresh (CoinGecko free tier friendly). */
  rwaAggregatesMs: num("RECODE_RWA_AGGREGATES_INTERVAL_MS", 15 * 60_000),
  /** How often resolved logos are re-probed (unreachable â†’ initials fallback). */
  logoRecheckMs: num("RECODE_LOGO_RECHECK_MS", 6 * 3_600_000),
  /** Whale threshold, configurable per spec (default $10,000). */
  whaleThresholdUsd: num("RECODE_WHALE_THRESHOLD_USD", 10_000),
  /** Data older than this is marked STALE. */
  priceFreshnessMs: num("RECODE_PRICE_FRESHNESS_MS", 120_000),
  /** Some public endpoints (Blockscout/Cloudflare) reject non-browser UAs. */
  userAgent:
    process.env.RECODE_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  requestTimeoutMs: num("RECODE_REQUEST_TIMEOUT_MS", 10_000),
  maxBackoffMs: num("RECODE_MAX_BACKOFF_MS", 300_000),
  intervals: {
    discoveryMs: num("RECODE_DISCOVERY_INTERVAL_MS", 300_000),
    metadataMs: num("RECODE_METADATA_INTERVAL_MS", 120_000),
    priceMs: num("RECODE_PRICE_INTERVAL_MS", 15_000),
    candlesMs: num("RECODE_CANDLES_INTERVAL_MS", 60_000),
    transactionsMs: num("RECODE_TRANSACTIONS_INTERVAL_MS", 5_000),
    whalesMs: num("RECODE_WHALES_INTERVAL_MS", 10_000),
    /** Unified whale-activity pipeline (Blockscout + Goldsky + RPC logs). */
    whaleActivityMs: num("RECODE_WHALE_ACTIVITY_INTERVAL_MS", 10_000),
    liquidityMs: num("RECODE_LIQUIDITY_INTERVAL_MS", 30_000),
    holdersMs: num("RECODE_HOLDERS_INTERVAL_MS", 300_000),
    walletsMs: num("RECODE_WALLETS_INTERVAL_MS", 300_000),
    pruneMs: num("RECODE_PRUNE_INTERVAL_MS", 1_800_000),
  },
  retention: {
    historyMs: 30 * 24 * 3_600_000,
    transactions: 500,
    whales: 300,
    discovery: 50,
    maxCandles: 1_000,
  },
  metadataBatch: 20,
  maxHotPairs: 8,
} as const;