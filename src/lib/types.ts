/**
 * ============================================================
 * RECODE — shared type contracts
 * ============================================================
 * Frontend → Application Services → Data Providers → chain/indexers.
 * These contracts are the boundary: the sync engine (server) and the
 * UI (client) meet here. Values are engine-verified or explicitly
 * unavailable — never fabricated.
 */

import { EVM_ADDRESS_RE } from "./format";
import { isValidSolanaAddress } from "./base58";

export type DataStatus =
  | "connecting"
  | "syncing"
  | "live"
  | "stale"
  | "unavailable"
  | "unconfigured";

export interface DataResult<T> {
  status: DataStatus;
  data: T | null;
  error?: string;
  source?: string;
  asOf?: number;
}

export type AssetType =
  | "tokenized-stock"
  | "etf"
  | "treasury"
  | "bond"
  | "commodity"
  | "fund"
  | "private-credit"
  | "real-estate"
  | "stablecoin"
  | "other";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  "tokenized-stock": "Tokenized Stock",
  etf: "ETF",
  treasury: "Treasury",
  bond: "Bond",
  commodity: "Commodity",
  fund: "Fund",
  "private-credit": "Private Credit",
  "real-estate": "Real Estate",
  stablecoin: "Stablecoin",
  other: "Other RWA",
};

export type Timeframe = "1H" | "4H" | "24H" | "7D" | "30D" | "ALL";

export interface MetricValue {
  value: number | null;
  change24h: number | null;
  sparkline: number[] | null;
  status: DataStatus;
}

/** A wallet position returned by the live on-chain balance service. */
export interface WalletHolding {
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  contract: string | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  source: string;
}

export interface WalletBalances {
  address: string;
  chainId: number;
  chainOnline: boolean;
  nativeSymbol: string;
  balances: WalletHolding[];
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

export interface WalletTransfer {
  txHash: string;
  ts: number | null;
  direction: "in" | "out" | "self" | "transfer";
  counterparty: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenAddress: string | null;
  amount: number | null;
  usd: number | null;
}

export interface WalletActivity {
  address: string;
  chainOnline: boolean;
  transfers: WalletTransfer[];
  transfersAvailable: boolean;
  /** Which verified source served the activity. */
  source: "explorer" | "store" | null;
  txCount: number | null;
  accountAge: number | null;
  errors: string[];
  updatedAt: number;
}

/** Behavioral classification — only computed when enough verified data exists. */
export interface WalletBehavior {
  label: string | null;
  basis: string | null;
}

export type ScanContractType =
  | "erc20"
  | "erc721"
  | "proxy"
  | "contract"
  | "eoa"
  | "unknown";

export interface ContractIntel {
  address: string;
  chainOnline: boolean;
  exists: boolean | null;
  isContract: boolean | null;
  contractType: ScanContractType | null;
  tokenStandard: "ERC-20" | "ERC-721" | null;
  codeSizeBytes: number | null;
  isVerified: boolean | null;
  compiler: string | null;
  evmVersion: string | null;
  license: string | null;
  creator: string | null;
  deploymentTx: string | null;
  deployedAt: number | null;
  owner: string | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupplyRaw: string | null;
  nameSource: "registry" | "explorer" | "rpc" | null;
  isProxy: boolean | null;
  implementation: string | null;
  adminAddress: string | null;
  market: {
    price: number | null;
    change24hPct: number | null;
    marketCap: number | null;
    fdv: number | null;
    volume24h: number | null;
    liquidity: number | null;
    liquidityConfigured: boolean;
  } | null;
  recentTransfers: {
    count: number;
    fromBlock: number;
    toBlock: number;
  } | null;
  logoUrl: string | null;
  txCount: number | null;
  tokenTransfersCount: number | null;
  holders: number | null;
  known: boolean;
  knownSymbol: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  riskFactors: string[];
  errors: string[];
  updatedAt: number;
}

export type AlertMetric =
  | "price"
  | "volume"
  | "liquidity"
  | "whale-activity"
  | "holder-growth"
  | "smart-money";

export type AlertCondition = "above" | "below" | "change-pct";

export interface RecodeAlert {
  id: string;
  asset: string; // symbol or address
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  note?: string;
  createdAt: number;
  status: "armed" | "paused" | "triggered";
  feedStatus: "awaiting-feed" | "live" | "unavailable";
  triggeredAt?: number;
  triggeredValue?: number;
}

export interface WatchEntry {
  kind: "asset" | "wallet" | "contract";
  id: string; // symbol / address
  label: string;
  addedAt: number;
}

export type EvmChainId = number;

export interface ChainRuntime {
  id: string;
  name: string;
  shortName: string;
  kind: "chain" | "ecosystem";
  /** Address family — EVM networks and Solana never share address logic. */
  family: "evm" | "solana";
  icon?: string;
  chainId: EvmChainId | null;
  chainIdHex: string | null;
  explorerUrl: string | null;
  /** Data currently indexed by the sync engine for this network. */
  indexed: boolean;
  note: string | null;
}

/** Base58 (Solana) address check — distinct from EVM 0x addresses. */
export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type AddressFamily = "evm" | "solana";

/** Deterministic address-family detection: 0x… → evm, base58 → solana. */
export function addressFamily(address: string): AddressFamily | null {
  const a = address.trim();
  if (!a) return null;
  if (EVM_ADDRESS_RE.test(a)) return "evm";
  // Strict base58 validation (charset + 32-byte decode) so typo'd or
  // checksum-invalid strings are rejected as neither family.
  if (isValidSolanaAddress(a)) return "solana";
  return null;
}
