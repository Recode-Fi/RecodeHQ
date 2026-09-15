import type { EngineStatus } from "@/server/sync/types";
import type { LiveOverview } from "@/server/sync/analyticsService";
import type { ContractIntel, WalletActivity, WalletBalances } from "@/lib/types";

/**
 * ============================================================
 * Client bridge to the MarketSyncEngine + on-chain services.
 * Returns only engine-verified data. An empty engine yields
 * status "empty" so callers render honest loading/unavailable
 * states — never placeholder numbers.
 * ============================================================
 */

export interface LiveMarketRow {
  address: string;
  symbol: string | null;
  name: string | null;
  assetType: string;
  tokenStandard: string | null;
  stockTokenMarketCap: number | null;
  underlyingMarketCap: number | null;
  underlyingSymbol: string | null;
  underlyingAssetType: string | null;
  underlying: string | null;
  chainId: number;
  logoUrl: string | null;
  verified: boolean | null;
  firstSeen: number;
  source: string;
  fdv: number | null;
  marketCap: number | null;
  /** Verified supply hierarchy (total/circulating + source metadata). */
  supply: {
    total: number | null;
    circulating: number | null;
    source: string | null;
    verified: boolean;
    confidence: number;
    circulatingBasis: string | null;
    updatedAt: number | null;
  } | null;
  price: number | null;
  bid: number | null;
  ask: number | null;
  /** Relative bid/ask spread, % — calculated from verified bid/ask. */
  spreadPct: number | null;
  halted: boolean | null;
  /** Derived from official tradingCapabilities + provider halt flag (see lib/tradingSession). */
  tradingStatus: string | null;
  tradingCapabilities: string[] | null;
  high24h: number | null;
  low24h: number | null;
  change24hPct: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buyVolume24h: number | null;
  sellVolume24h: number | null;
  liquidity: number | null;
  liquidityConfigured: boolean;
  holders: number | null;
  updatedAt: number | null;
  dataStatus: "live" | "stale" | "unavailable";
  sparkline: number[];
  dataSources: Record<string, string | null>;
  isNew: boolean;
  sector: string | null;
  classificationSource: "provider_metadata" | "manual_verified_mapping" | null;
  industry: string | null;
}

export interface LiveCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

/** One Asset Intelligence metric — score/label + its exact derivation basis. */
export interface LiveIntelligence {
  symbol: string | null;
  address: string;
  momentum: { score: number; basis: string } | null;
  volumeActivity: { rvol: number; label: string; basis: string } | null;
  liquidity: { score: number; label: string; basis: string } | null;
  volatility: { label: string; basis: string } | null;
  trend: { label: string; basis: string } | null;
  dataConfidence: number;
  unavailable: string[];
  inputs: {
    candleTimeframe: string | null;
    candleSource: string | null;
    candleCount: number;
    volume24h: number | null;
    spreadPct: number | null;
    change24hPct: number | null;
  };
  thresholds: { momentumWeights: number[]; freshnessMs: number };
  computedAt: number;
}

export interface LiveHolders {
  address: string;
  symbol: string;
  total: number | null;
  new24h: number | null;
  lost24h: number | null;
  growthPct: number | null;
  concentration: number | null;
  top: { address: string | null; sharePct: number | null; balance: number | null; usd: number | null }[];
  updatedAt: number;
}

export interface LiveTx {
  /** Stable store event id (txHash:logIndex — unique per event); null only for legacy cached rows. */
  id: string | null;
  hash: string;
  ts: number;
  wallet: string | null;
  action: string;
  amount: number | null;
  usd: number | null;
  symbol: string | null;
  address: string | null;
}

export interface LiveWhale {
  id: string;
  /** Parent tx hash when available (used for explorer links). */
  hash?: string | null;
  ts: number;
  wallet: string | null;
  symbol: string | null;
  address: string | null;
  kind: string;
  usd: number | null;
  /** Other side of the transfer (null when unknown / legacy rows). */
  counterparty?: string | null;
  /** Producing source: blockscout / goldsky-subgraph / rpc-getlogs / robinhood-indexer / derived-direction. */
  source?: string | null;
  /** Buy/sell evidence or derivation rule (null for plain transfers). */
  basis?: string | null;
  /** "block" = real chain timestamp; "ingest" = observation time (legacy/rpc rows). */
  tsBasis?: "block" | "ingest";
}

/** Health of the whale-activity sources, served with the feed. */
export interface WhaleFeedMeta {
  explorerTxBase: string | null;
  whaleThresholdUsd: number;
  engineMode: string;
  updatedAt: number;
  providers: {
    id: string;
    label: string;
    configured: boolean;
    ok: boolean | null;
    lastSuccess: number | null;
  }[];
  counts: { buy: number; sell: number; transfer: number; accumulation: number; distribution: number };
}

export interface LiveRwaAggregates {
  updatedAt: number | null;
  sources: string[];
  categories: {
    category: string;
    marketCap: number | null;
    volume24h: number | null;
    change24hPct: number | null;
    sparkline: number[] | null;
    assets: number | null;
    updatedAt: number | null;
    source: string | null;
  }[];
}

export interface LiveUniverseRow {
  id: string;
  symbol: string;
  name: string;
  category: string;
  chain: "multi-chain";
  price: number | null;
  marketCap: number | null;
  rank: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  sparkline: number[] | null;
  updatedAt: number;
  source: "CoinGecko";
}

export interface Envelope<T> {
  status: "live" | "empty" | "stale" | "unavailable" | "error";
  data: T | null;
  error?: string;
}

async function getJson<T>(path: string): Promise<Envelope<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: "unavailable", data: null, error: body?.error };
    }
    return (await res.json()) as Envelope<T>;
  } catch {
    return { status: "unavailable", data: null };
  }
}

async function postJson<T>(path: string, body: unknown): Promise<Envelope<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: "unavailable", data: null, error: j?.error };
    }
    return (await res.json()) as Envelope<T>;
  } catch {
    return { status: "unavailable", data: null };
  }
}

export const recodeService = {
  status(): Promise<EngineStatus | null> {
    return (async () => {
      try {
        const res = await fetch("/api/sync/status", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as EngineStatus;
      } catch {
        return null;
      }
    })();
  },

  overview(): Promise<Envelope<LiveOverview>> {
    return getJson<LiveOverview>("/api/sync/overview");
  },

  markets(tf: string = "24H"): Promise<Envelope<LiveMarketRow[]>> {
    return getJson<LiveMarketRow[]>(`/api/sync/markets?tf=${encodeURIComponent(tf)}`);
  },

  candles(symbol: string, tf: string): Promise<Envelope<LiveCandle[]>> {
    return getJson<LiveCandle[]>(
      `/api/sync/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`,
    );
  },

  transactions(symbol?: string): Promise<Envelope<LiveTx[]>> {
    return getJson<LiveTx[]>(
      `/api/sync/transactions${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`,
    );
  },

  whales(minUsd?: number): Promise<Envelope<LiveWhale[]>> {
    return getJson<LiveWhale[]>(`/api/sync/whales${minUsd ? `?minUsd=${minUsd}` : ""}`);
  },

  rwaAggregates(): Promise<Envelope<LiveRwaAggregates>> {
    return getJson<LiveRwaAggregates>("/api/sync/rwa-aggregates");
  },

  universe(): Promise<Envelope<LiveUniverseRow[]>> {
    return getJson<LiveUniverseRow[]>("/api/sync/universe");
  },

  holders(symbol: string): Promise<Envelope<LiveHolders>> {
    return getJson<LiveHolders>(`/api/sync/holders?symbol=${encodeURIComponent(symbol)}`);
  },

  intelligence(symbol: string): Promise<Envelope<LiveIntelligence>> {
    return getJson<LiveIntelligence>(`/api/sync/intelligence?symbol=${encodeURIComponent(symbol)}`);
  },

  walletBalances(address: string): Promise<Envelope<WalletBalances>> {
    return getJson<WalletBalances>(
      `/api/wallet/balances?address=${encodeURIComponent(address)}`,
    );
  },

  walletActivity(address: string): Promise<Envelope<WalletActivity>> {
    return getJson<WalletActivity>(
      `/api/wallet/activity?address=${encodeURIComponent(address)}`,
    );
  },

  contractIntel(address: string): Promise<Envelope<ContractIntel>> {
    return getJson<ContractIntel>(`/api/contract?address=${encodeURIComponent(address)}`);
  },
};
