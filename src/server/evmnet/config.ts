import type { EvmChainConfig } from "./types";

/**
 * ============================================================
 * EVM NET — per-chain configuration (Ethereum, BSC, Arbitrum)
 * ============================================================
 * All values verified live (2026-09):
 *   - eth_chainId probed on each official/public endpoint
 *   - whale-flow emitters (canonical stablecoins) verified via
 *     on-chain symbol()/decimals() calls before being encoded
 *   - DexScreener chain ids probed live with real token contracts
 *
 * Whale flows use the chain's canonical stablecoin Transfer logs as
 * the event source (same evidence pattern as the Arc system emitter):
 * every event carries a real transaction hash; USD = face value.
 */

export const EVM_NET_CHAINS = {
  ethereum: {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    chainIdHex: "0x1",
    rpcUrl: process.env.RECODE_ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
    explorerUrl: "https://etherscan.io",
    nativeSymbol: "ETH",
    dexscreenerChain: "ethereum",
    /** Canonical USDT — verified on-chain: symbol USDT, 6 decimals. */
    whaleEmitter: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    whaleSymbol: "USDT",
    whaleDecimals: 6,
    /** Search seeds (DEX/ecosystem names — NOT data) for pair discovery. */
    discoverySeeds: ["ethereum", "ETH", "uniswap", "PEPE", "SHIB", "LINK", "UNI", "AAVE", "DAI"],
  },
  bsc: {
    key: "bsc",
    name: "BNB Smart Chain",
    chainId: 56,
    chainIdHex: "0x38",
    /** publicnode default: the binance-dataseed endpoints reject eth_getLogs. */
    rpcUrl: process.env.RECODE_BSC_RPC_URL ?? "https://bsc-rpc.publicnode.com",
    explorerUrl: "https://bscscan.com",
    nativeSymbol: "BNB",
    dexscreenerChain: "bsc",
    /** Canonical USDT (BSC) — verified on-chain: symbol USDT, 18 decimals. */
    whaleEmitter: "0x55d398326f99059fF775485246999027B3197955",
    whaleSymbol: "USDT",
    whaleDecimals: 18,
    discoverySeeds: ["bsc", "BNB", "pancakeswap", "USDT", "CAKE", "WBNB"],
  },
  arbitrum: {
    key: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    chainIdHex: "0xa4b1",
    rpcUrl: process.env.RECODE_ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    nativeSymbol: "ETH",
    dexscreenerChain: "arbitrum",
    /** Canonical USDC (Arbitrum) — verified on-chain: symbol USDC, 6 decimals. */
    whaleEmitter: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    whaleSymbol: "USDC",
    whaleDecimals: 6,
    discoverySeeds: ["arbitrum", "ARB", "GMX", "USDC", "MAGIC", "PENDLE", "WSTETH", "WETH"],
  },
} as const satisfies Record<string, EvmChainConfig>;

export type EvmNetChainKey = keyof typeof EVM_NET_CHAINS;

export function isEvmNetChain(key: string): key is EvmNetChainKey {
  return key === "ethereum" || key === "bsc" || key === "arbitrum";
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Per-chain runtime tuning (shared defaults; env-overridable). */
export function evmNetConfig(chain: EvmNetChainKey) {
  const c = EVM_NET_CHAINS[chain];
  return {
    chain,
    name: c.name,
    chainId: c.chainId,
    rpcUrl: c.rpcUrl,
    maxTokens: num(`RECODE_${chain.toUpperCase()}_MAX_TOKENS`, 120),
    whaleThresholdUsd: num(`RECODE_${chain.toUpperCase()}_WHALE_THRESHOLD_USD`, 100_000),
    discoveryMs: num(`RECODE_${chain.toUpperCase()}_DISCOVERY_INTERVAL_MS`, 600_000),
    marketsMs: num(`RECODE_${chain.toUpperCase()}_MARKETS_INTERVAL_MS`, 90_000),
    whalesMs: num(`RECODE_${chain.toUpperCase()}_WHALES_INTERVAL_MS`, 120_000),
    whaleScanBlocks: num(`RECODE_${chain.toUpperCase()}_WHALE_SCAN_BLOCKS`, 20),
    retention: {
      historyMs: 30 * 24 * 3_600_000,
      whales: 300,
      stablecoin: 500,
      signals: 200,
    },
    dexscreenerUrl: process.env.RECODE_DEXSCREENER_URL ?? "https://api.dexscreener.com",
    requestTimeoutMs: num("RECODE_REQUEST_TIMEOUT_MS", 12_000),
    userAgent:
      process.env.RECODE_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
}