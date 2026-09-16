/**
 * EVM NET client bridge (Ethereum / BSC / Arbitrum). Chain is explicit
 * in every path; each chain polls its own endpoints (no shared cache).
 */

export type EvmNetChain = "ethereum" | "bsc" | "arbitrum";

export interface EvmEnvelope<T> {
  status: "live" | "stale" | "syncing" | "unavailable" | "empty" | "error";
  data: T | null;
  error?: string;
}

export interface EvmNetMarketRow {
  chain: EvmNetChain;
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

export interface EvmNetEngineStatus {
  chain: EvmNetChain;
  name: string;
  chainId: number;
  rpcChainId: number | null;
  rpcOk: boolean | null;
  explorerUrl: string;
  nativeSymbol: string;
  whaleSymbol: string;
  mode: string;
  tokensIndexed: number;
  whalesStored: number;
  signalsStored: number;
  updatedAt: number | null;
}

export interface EvmNetWhaleEvent {
  kind: "transfer" | "mint" | "burn";
  amount: number;
  usd: number;
  symbol: string;
  from: string | null;
  to: string | null;
  txHash: string;
  blockNumber: number;
  source: string;
  observedAt: number;
}

export interface EvmNetRadarSignal {
  id: string;
  kind: string;
  severity: "high" | "notable" | "info";
  token: string | null;
  symbol: string | null;
  message: string;
  basis: string;
  detectedAt: number;
}

export interface EvmNetSmartMoneyWallet {
  chain: EvmNetChain;
  wallet: string;
  netUsd: number | null;
  symbol: string;
  inflows: number;
  outflows: number;
  transfers: number;
  lastActive: number;
}

export interface EvmNetTokenIntel {
  chain: EvmNetChain;
  direct: boolean;
  token: {
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
    sources: string[];
  } | null;
  metadata: {
    address: string;
    isContract: boolean;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
  pairs: number;
  source: string;
  errors: string[];
}

export interface EvmNetWalletBalances {
  chain: EvmNetChain;
  chainId: number;
  address: string;
  chainOnline: boolean;
  nativeSymbol: string;
  holdings: {
    kind: "native" | "erc20";
    address: string | null;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    amount: number | null;
    priceUsd: number | null;
    valueUsd: number | null;
    status: "priced" | "unpriced";
  }[];
  pricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

export interface EvmNetWalletActivity {
  chain: EvmNetChain;
  address: string;
  records: {
    txHash: string;
    explorerUrl: string;
    blockNumber: number;
    action: "Received" | "Sent" | "Mint" | "Burn";
    symbol: string;
    amount: number;
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

async function getJson<T>(path: string): Promise<EvmEnvelope<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: "unavailable", data: null, error: body?.error };
    }
    return (await res.json()) as EvmEnvelope<T>;
  } catch {
    return { status: "unavailable", data: null };
  }
}

export const evmNetService = {
  status(chain: EvmNetChain): Promise<EvmNetEngineStatus | null> {
    return (async () => {
      try {
        const res = await fetch(`/api/evm/${chain}/status`, { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as EvmNetEngineStatus;
      } catch {
        return null;
      }
    })();
  },
  markets(chain: EvmNetChain): Promise<EvmEnvelope<EvmNetMarketRow[]>> {
    return getJson<EvmNetMarketRow[]>(`/api/evm/${chain}/markets`);
  },
  whales(chain: EvmNetChain): Promise<EvmEnvelope<EvmNetWhaleEvent[]>> {
    return getJson<EvmNetWhaleEvent[]>(`/api/evm/${chain}/whales`);
  },
  radar(chain: EvmNetChain): Promise<EvmEnvelope<EvmNetRadarSignal[]>> {
    return getJson<EvmNetRadarSignal[]>(`/api/evm/${chain}/radar`);
  },
  smartMoney(chain: EvmNetChain, windowHours = 24): Promise<EvmEnvelope<EvmNetSmartMoneyWallet[]>> {
    return getJson<EvmNetSmartMoneyWallet[]>(
      `/api/evm/${chain}/smart-money?windowHours=${windowHours}`,
    );
  },
  token(chain: EvmNetChain, address: string): Promise<EvmEnvelope<EvmNetTokenIntel>> {
    return getJson<EvmNetTokenIntel>(`/api/evm/${chain}/token/${encodeURIComponent(address)}`);
  },
  walletBalances(chain: EvmNetChain, address: string): Promise<EvmEnvelope<EvmNetWalletBalances>> {
    return getJson<EvmNetWalletBalances>(
      `/api/evm/${chain}/wallet/balances?address=${encodeURIComponent(address)}`,
    );
  },
  walletActivity(chain: EvmNetChain, address: string): Promise<EvmEnvelope<EvmNetWalletActivity>> {
    return getJson<EvmNetWalletActivity>(
      `/api/evm/${chain}/wallet/activity?address=${encodeURIComponent(address)}&blocks=60`,
    );
  },
};