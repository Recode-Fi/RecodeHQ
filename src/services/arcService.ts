/**
 * ============================================================
 * Client bridge to the Arc intelligence layer (chain 5042).
 * Chain identity is explicit on every payload ("arc");
 * empty/unavailable states are rendered honestly.
 * ============================================================
 */

export interface ArcEnvelope<T> {
  status: "live" | "stale" | "syncing" | "unavailable" | "empty" | "error";
  data: T | null;
  error?: string;
}

export interface ArcMarketRow {
  chain: "arc";
  address: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  priceUsd: number | null;
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
  quoteToken: string | null;
  isNew: boolean;
  pairAgeMs: number | null;
  dataStatus: "live" | "stale";
  updatedAt: number | null;
  sources: string[];
}

export interface ArcEngineStatus {
  chain: "arc";
  network: string;
  chainId: number;
  expectedChainId: number;
  rpcChainId: number | null;
  rpcOk: boolean | null;
  rpcLastError: string | null;
  explorerUrl: string;
  gasSymbol: string;
  gasDecimals: number;
  usdcErc20: string;
  mode: string;
  tokensIndexed: number;
  whalesStored: number;
  stablecoinStored: number;
  signalsStored: number;
  updatedAt: number | null;
}

export interface ArcWhaleEvent {
  kind: "transfer" | "mint" | "burn";
  amountUsdc: number;
  usd: number;
  from: string | null;
  to: string | null;
  txHash: string;
  blockNumber: number;
  source: string;
  observedAt: number;
}

export interface ArcRadarSignal {
  id: string;
  kind: string;
  severity: "high" | "notable" | "info";
  token: string | null;
  symbol: string | null;
  message: string;
  basis: string;
  detectedAt: number;
}

export interface ArcSmartMoneyWallet {
  chain: "arc";
  wallet: string;
  netUsdc: number | null;
  inflows: number;
  outflows: number;
  transfers: number;
  lastActive: number;
}

export interface ArcStablecoinData {
  chain: "arc";
  gasSymbol: string;
  usdcContract: string;
  events: {
    kind: "inflow" | "outflow" | "transfer" | "mint" | "burn";
    wallet: string;
    counterparty: string | null;
    amountUsdc: number;
    usd: number;
    txHash: string;
    blockNumber: number;
    observedAt: number;
  }[];
  eventsCount: number;
  windowInflowUsdc: number;
  windowOutflowUsdc: number;
  windowNetUsdc: number;
  basis: string;
  updatedAt: number | null;
}

export interface ArcWalletBalances {
  chain: "arc";
  network: string;
  chainId: number;
  address: string;
  chainOnline: boolean;
  holdings: {
    kind: "native-gas" | "erc20";
    address: string | null;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    amount: number | null;
    priceUsd: number | null;
    valueUsd: number | null;
    status: "priced" | "unpriced" | "unavailable";
  }[];
  pricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

export interface ArcTokenIntel {
  chain: "arc";
  direct: boolean;
  token: {
    address: string;
    symbol: string | null;
    name: string | null;
    logoUrl: string | null;
    decimals: number | null;
    priceUsd: number | null;
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
    quoteToken: string | null;
    sources: string[];
  } | null;
  metadata: {
    address: string;
    isContract: boolean;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
  whales: number;
  pairs: number;
  source: string;
  errors: string[];
}

export interface ArcWalletActivity {
  chain: "arc";
  address: string;
  records: {
    txHash: string;
    explorerUrl: string;
    blockNumber: number;
    action: "Received" | "Sent" | "Mint" | "Burn";
    amountUsdc: number;
    usd: number;
    counterparty: string | null;
    observedAt: number;
  }[];
  recordsCount: number;
  fromBlock: number | null;
  toBlock: number | null;
  updatedAt: number;
  errors: string[];
}

async function getJson<T>(path: string): Promise<ArcEnvelope<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: "unavailable", data: null, error: body?.error };
    }
    return (await res.json()) as ArcEnvelope<T>;
  } catch {
    return { status: "unavailable", data: null };
  }
}

export const arcService = {
  status(): Promise<ArcEngineStatus | null> {
    return (async () => {
      try {
        const res = await fetch("/api/arc/status", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as ArcEngineStatus;
      } catch {
        return null;
      }
    })();
  },
  markets(): Promise<ArcEnvelope<ArcMarketRow[]>> {
    return getJson<ArcMarketRow[]>("/api/arc/markets");
  },
  whales(): Promise<ArcEnvelope<ArcWhaleEvent[]>> {
    return getJson<ArcWhaleEvent[]>("/api/arc/whales");
  },
  radar(): Promise<ArcEnvelope<ArcRadarSignal[]>> {
    return getJson<ArcRadarSignal[]>("/api/arc/radar");
  },
  smartMoney(windowHours = 24): Promise<ArcEnvelope<ArcSmartMoneyWallet[]>> {
    return getJson<ArcSmartMoneyWallet[]>(
      `/api/arc/smart-money?windowHours=${encodeURIComponent(windowHours)}`,
    );
  },
  stablecoin(wallet?: string): Promise<ArcEnvelope<ArcStablecoinData>> {
    return getJson<ArcStablecoinData>(
      `/api/arc/stablecoin${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ""}`,
    );
  },
  token(address: string): Promise<ArcEnvelope<ArcTokenIntel>> {
    return getJson<ArcTokenIntel>(`/api/arc/token/${encodeURIComponent(address)}`);
  },
  walletBalances(address: string): Promise<ArcEnvelope<ArcWalletBalances>> {
    return getJson<ArcWalletBalances>(
      `/api/arc/wallet/balances?address=${encodeURIComponent(address)}`,
    );
  },
  walletActivity(address: string): Promise<ArcEnvelope<ArcWalletActivity>> {
    return getJson<ArcWalletActivity>(
      `/api/arc/wallet/activity?address=${encodeURIComponent(address)}&blocks=150`,
    );
  },
};