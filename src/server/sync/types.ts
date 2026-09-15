import type { AssetType } from "@/lib/types";

export type SyncAssetType = AssetType | "unknown";

/** A discovered market (tokenized stock / RWA) on Robinhood Chain. */
export interface SyncMarket {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  totalSupply: string | null;
  circulatingSupply: string | null;
  tokenStandard: string | null;
  /** Official per-asset trading capabilities (day / extended / overnight). Optional for legacy cached rows. */
  tradingCapabilities?: string[] | null;
  assetType: SyncAssetType;
  underlying: string | null;
  underlyingSymbol: string | null;
  underlyingAssetType: string | null;
  logoUrl: string | null;
  verified: boolean | null;
  multiplier: number | null;
  chainId: number;
  status: "active" | "unknown";
  firstSeen: number;
  lastSynced: number | null;
  source: "registry" | "indexer" | "rpc" | "price-feed";
}

/** Latest confirmed price + volume fields for a market. */
export interface SyncPrice {
  address: string;
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  halted: boolean | null;
  marketCap: number | null;
  change24hPct: number | null;
  change24hValue: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume1h: number | null;
  volume24h: number | null;
  volume7d: number | null;
  buyVolume24h: number | null;
  sellVolume24h: number | null;
  avgTradeSize: number | null;
  updatedAt: number;
  source: string;
}

export type CandleTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

/** Per-market resolved reachable logo URL (null → UI renders ticker initials). */
export interface SyncLogoResolution {
  url: string | null;
  checkedAt: number;
}

export interface SyncCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface SyncLiquidityPool {
  address: string;
  dex: string | null;
  liquidityUsd: number | null;
}

export interface SyncLiquidity {
  address: string;
  symbol: string;
  total: number | null;
  buy: number | null;
  sell: number | null;
  change24h: number | null;
  providers: number | null;
  pools: SyncLiquidityPool[];
  updatedAt: number;
}

export interface SyncLiquidityPoint {
  t: number;
  total: number;
}

export interface SyncHolderEntry {
  address: string | null;
  sharePct: number | null;
  balance: number | null;
  usd: number | null;
}

export interface SyncHolders {
  address: string;
  symbol: string;
  total: number | null;
  new24h: number | null;
  lost24h: number | null;
  growthPct: number | null;
  concentration: number | null;
  top: SyncHolderEntry[];
  updatedAt: number;
  /** Token-intelligence provenance + share derivation (additive, optional for legacy rows). */
  intel?: {
    source: string;
    provider: string;
    verified: boolean;
    confidence: number;
    updatedAt: number | null;
    freshness: string;
    sharePctDerived: boolean;
  };
}

export interface SyncHolderPoint {
  t: number;
  holders: number;
}

export type SyncTxAction = "buy" | "sell" | "transfer" | "mint" | "burn";

export interface SyncTx {
  id: string;
  hash: string;
  ts: number;
  wallet: string | null;
  action: SyncTxAction;
  amount: number | null;
  usd: number | null;
  symbol: string | null;
  address: string | null;
  /** The other side of the transfer (null when unknown). Optional for legacy rows. */
  counterparty?: string | null;
  /** Producing source (e.g. blockscout / goldsky-subgraph / rpc-getlogs). Optional for legacy rows. */
  source?: string | null;
  /** Buy/sell evidence string; null for transfers. Optional for legacy rows. */
  basis?: string | null;
  /** Whether ts is a real block timestamp or the observation time. Optional for legacy rows. */
  tsBasis?: "block" | "ingest";
}

export interface SyncWhale {
  id: string;
  /** Parent transaction hash when the source provides one (null for derived rows). */
  hash?: string | null;
  ts: number;
  wallet: string | null;
  symbol: string | null;
  address: string | null;
  kind: "accumulation" | "distribution" | "buy" | "sell" | "transfer";
  usd: number | null;
  /** The other side of the transfer (null when unknown). Optional for legacy rows. */
  counterparty?: string | null;
  /** Producing source (e.g. blockscout / derived-direction). Optional for legacy rows. */
  source?: string | null;
  /** Evidence / derivation string; null for plain transfers. Optional for legacy rows. */
  basis?: string | null;
  /** Whether ts is a real block timestamp or the observation time. Optional for legacy rows. */
  tsBasis?: "block" | "ingest";
}


export interface SyncWallet {
  address: string;
  portfolioUsd: number | null;
  activityScore: number | null;
  lastActive: number | null;
}

export interface SyncDiscoveryEvent {
  address: string;
  symbol: string | null;
  firstSeen: number;
  liquidity: number | null;
  volume24h: number | null;
  holders: number | null;
}

/** Underlying security market capitalization (company/ETF), provider-verified. */
export interface SyncUnderlying {
  address: string;
  symbol: string;
  marketCap: number | null;
  /** Verified previous close of the underlying (RHJ fundamentals) — the
      real 24H-change reference for the tokenized asset. */
  previousClose: number | null;
  updatedAt: number;
  source: string;
}

export interface ProviderState {
  configured: boolean;
  ok: boolean | null;
  lastAttempt: number | null;
  lastSuccess: number | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface EngineTaskState {
  id: string;
  label: string;
  intervalMs: number;
  lastRun: number | null;
  lastSuccess: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
}

export interface EngineStatus {
  running: boolean;
  startedAt: number | null;
  chainId: number;
  mode: "standby" | "syncing" | "live" | "degraded";
  providers: Record<
    "rpc" | "indexer" | "priceFeed" | "blockscout" | "robinhood" | "coingecko",
    ProviderState
  >;
  /** CoinGecko key configured (boolean only — the key itself never leaves the server). */
  coingeckoKeyConfigured: boolean;
  tasks: EngineTaskState[];
  marketsIndexed: number;
  pricesSynced: number;
  transactionsStored: number;
  whalesStored: number;
  /** Token-intelligence provider roles + configuration booleans (no URLs/keys). */
  intelligence: {
    holdersPrimary: string;
    holdersFallback: string;
    indexerConfigured: boolean;
    fallbackConfigured: boolean;
    indexerOk: boolean | null;
    fallbackOk: boolean | null;
    indexerLastSuccess: number | null;
    fallbackLastSuccess: number | null;
  };
  updatedAt: number;
}