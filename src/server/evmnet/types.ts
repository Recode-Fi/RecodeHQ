/** Shared types for the generic EVM net intelligence layer. */

export interface EvmChainConfig {
  key: string;
  name: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  dexscreenerChain: string;
  /** Canonical stablecoin used as the whale-flow event emitter. */
  whaleEmitter: string;
  whaleSymbol: string;
  whaleDecimals: number;
  /** Search seeds (DEX/ecosystem names — not data) for pair discovery. */
  discoverySeeds?: string[];
}

export interface EvmNetToken {
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
  pairCreatedAt: number | null;
  updatedAt: number | null;
  sources: string[];
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

export interface EvmNetStablecoinEvent {
  kind: "inflow" | "outflow" | "transfer" | "mint" | "burn";
  wallet: string;
  counterparty: string | null;
  amount: number;
  usd: number;
  symbol: string;
  txHash: string;
  blockNumber: number;
  observedAt: number;
}

export interface EvmNetRadarSignal {
  id: string;
  kind:
    | "unusual-volume"
    | "price-movement"
    | "newly-active"
    | "whale-activity"
    | "large-transfer";
  severity: "high" | "notable" | "info";
  token: string | null;
  symbol: string | null;
  message: string;
  basis: string;
  detectedAt: number;
}

export interface EvmNetStoreShape {
  version: 1;
  tokens: Record<string, EvmNetToken>;
  whales: EvmNetWhaleEvent[];
  stablecoin: EvmNetStablecoinEvent[];
  radar: EvmNetRadarSignal[];
  lastScannedBlock: number | null;
  updatedAt: number | null;
}