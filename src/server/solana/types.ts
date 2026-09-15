/**
 * ============================================================
 * SOLANA — shared server types (Solana intelligence layer)
 * ============================================================
 * The Solana pipeline mirrors the EVM sync contract: every value
 * is provider-verified or explicitly null — never fabricated.
 * Missing provider fields stay null and render "Data unavailable"
 * in the UI. Chain identity is always explicit ("solana").
 */

/** One tracked Solana token (SPL mint) with its latest verified market state. */
export interface SolanaToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  decimals: number | null;
  /** Verified USD price from the market-data provider (null = unavailable). */
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volume6hUsd: number | null;
  volume1hUsd: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  /** Trading activity (buys + sells, 24h) from the DEX pair. */
  txns24h: number | null;
  /** DEX id (e.g. raydium, orca) and pair address — null when unknown. */
  dexId: string | null;
  pairAddress: string | null;
  pairCreatedAt: number | null;
  websites: string[] | null;
  socials: { type: string; url: string }[] | null;
  supply: number | null;
  firstSeen: number;
  updatedAt: number;
  sources: string[];
}

export interface SolanaPricePoint {
  t: number;
  p: number;
}
export interface SolanaVolumePoint {
  t: number;
  v: number;
}
export interface SolanaLiquidityPoint {
  t: number;
  v: number;
}

export interface SolanaHolderEntry {
  /** Owner wallet (null when the owner account could not be resolved). */
  address: string | null;
  /** The SPL token account that was measured. */
  tokenAccount: string;
  balance: number | null;
  sharePct: number | null;
  usd: number | null;
}

export interface SolanaHolders {
  mint: string;
  symbol: string | null;
  supply: number | null;
  top: SolanaHolderEntry[];
  updatedAt: number;
}

/**
 * A whale event derived from observed balance changes of the largest
 * token accounts between two sync cycles (rule-based, evidence-backed):
 * paired inflow/outflow of matching size → transfer, unpaired →
 * accumulation/distribution. USD = delta × verified price (null-safe).
 */
export interface SolanaWhaleEvent {
  id: string;
  mint: string;
  symbol: string | null;
  /** Owner wallet when resolvable, else the token account. */
  wallet: string;
  kind: "accumulation" | "distribution" | "transfer";
  amount: number | null;
  usd: number | null;
  sharePctAfter: number | null;
  observedAt: number;
  source: string;
}

export type SolanaRadarKind =
  | "unusual-volume"
  | "liquidity-change"
  | "large-transfer"
  | "whale-activity"
  | "price-movement"
  | "newly-active";

export interface SolanaRadarSignal {
  id: string;
  kind: SolanaRadarKind;
  label: string;
  mint: string;
  symbol: string | null;
  /** Human-readable derivation basis — the numbers behind the signal. */
  basis: string;
  severity: "info" | "notable" | "high";
  detectedAt: number;
}

export interface SolanaProviderState {
  configured: boolean;
  ok: boolean | null;
  lastAttempt: number | null;
  lastSuccess: number | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface SolanaEngineStatus {
  running: boolean;
  startedAt: number | null;
  chain: "solana";
  network: "mainnet-beta";
  mode: "standby" | "syncing" | "live" | "degraded";
  providers: Record<"dexscreener" | "rpc", SolanaProviderState>;
  tasks: {
    id: string;
    label: string;
    lastRun: number | null;
    lastSuccess: number | null;
    lastError: string | null;
    runs: number;
    failures: number;
  }[];
  tokensIndexed: number;
  whalesStored: number;
  signalsStored: number;
  updatedAt: number | null;
}

/** UI row for the Solana market screener (mirrors LiveMarketRow semantics). */
export interface LiveSolanaRow {
  chain: "solana";
  mint: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  txns24h: number | null;
  dexId: string | null;
  pairAddress: string | null;
  pairCreatedAt: number | null;
  supply: number | null;
  /** 24h price sparkline from verified stored price points. */
  sparkline: number[];
  dataStatus: "live" | "stale" | "unavailable";
  updatedAt: number | null;
  isNew: boolean;
  sources: string[];
}