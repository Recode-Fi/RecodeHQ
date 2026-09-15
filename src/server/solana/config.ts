/**
 * ============================================================
 * SOLANA — server-side configuration (env-driven)
 * ============================================================
 * Without providers the Solana engine runs in standby and the
 * store stays empty — no values are ever fabricated.
 */

function str(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/$/, "") : null;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Alchemy key (server-side) → Solana mainnet RPC endpoint (optional). */
function alchemySolanaRpc(): string | null {
  const key = str("ALCHEMY_SOLANA_API_KEY");
  return key ? `https://solana-mainnet.g.alchemy.com/v2/${key}` : null;
}

export const SOLANA_CONFIG = {
  /** Chain identity — explicit, never mixed with EVM logic. */
  chain: "solana" as const,
  network: "mainnet-beta" as const,
  /** Solana JSON-RPC endpoint. Public mainnet-beta works (rate-limited);
      set RECODE_SOLANA_RPC_URL (e.g. Helius/Alchemy/QuickNode) for
      production throughput. */
  rpcUrl:
    str("RECODE_SOLANA_RPC_URL") ??
    str("HELIUS_RPC_URL") ??
    alchemySolanaRpc() ??
    "https://api.mainnet-beta.solana.com",
  /** DexScreener market-data API (keyless, verified live). */
  dexscreenerUrl: str("RECODE_DEXSCREENER_URL") ?? "https://api.dexscreener.com",
  /** How many Solana tokens the screener tracks (discovery cap). */
  maxTokens: num("RECODE_SOLANA_MAX_TOKENS", 240),
  /** Whale threshold for Solana balance-delta events (default $25,000). */
  whaleThresholdUsd: num("RECODE_SOLANA_WHALE_THRESHOLD_USD", 25_000),
  /** Quote freshness for dataStatus derivation. */
  priceFreshnessMs: num("RECODE_SOLANA_PRICE_FRESHNESS_MS", 180_000),
  /** Holders older than this are refreshed. */
  holdersMs: num("RECODE_SOLANA_HOLDERS_INTERVAL_MS", 300_000),
  /** Discovery refresh (token profiles + boosts + markets batch cycle). */
  discoveryMs: num("RECODE_SOLANA_DISCOVERY_INTERVAL_MS", 600_000),
  /** DEX market-data refresh per batch. */
  marketsMs: num("RECODE_SOLANA_MARKETS_INTERVAL_MS", 30_000),
  /** Whale balance-delta scan cadence. */
  whalesMs: num("RECODE_SOLANA_WHALES_INTERVAL_MS", 60_000),
  /** Mints per DexScreener batch call (API max 30). */
  batchMints: 30,
  /** Largest token accounts tracked per mint (RPC getTokenLargestAccounts max 20). */
  largestAccounts: 20,
  /** Holders tracked per mint rotation. */
  holdersPerCycle: 6,
  /** Whale-delta mints per cycle. */
  whalesPerCycle: 8,
  /** Retention. */
  retention: {
    historyMs: 30 * 24 * 3_600_000,
    whales: 300,
    signals: 200,
  },
  /** Some public endpoints reject non-browser user agents. */
  userAgent:
    process.env.RECODE_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  requestTimeoutMs: num("RECODE_REQUEST_TIMEOUT_MS", 12_000),
} as const;