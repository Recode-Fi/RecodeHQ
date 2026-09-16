/**
 * ============================================================
 * ARC — server-side configuration (env-driven)
 * ============================================================
 * All chain constants come from the OFFICIAL Arc documentation
 * (docs.arc.network / docs.arc.io — verified 2026-09):
 *   - Arc mainnet is live: chain id 5042 (0x13b2)
 *   - RPC: https://rpc.mainnet.arc.io (Alchemy/Blockdaemon/dRPC/QuickNode
 *     also official — configure via RECODE_ARC_RPC_URL)
 *   - Explorer: https://explorer.arc.io
 *   - Gas token: native USDC, 18 decimals (NOT ETH)
 *   - USDC ERC-20 interface: 0x3600000000000000000000000000000000000000 (6 decimals)
 *   - EIP-7708 native-USDC Transfer emitter: 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE (18 decimals)
 *     topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
 *   - IMPORTANT (official warning): an ERC-20 transfer() emits TWO logs —
 *     the ERC-20 contract's 6-decimal Transfer AND the system emitter's
 *     18-decimal Transfer. Filter by emitter address to avoid double-counting.
 *   - Arc is EVM-compatible (Osaka baseline) — the existing EVM address
 *     family applies; Arc data never touches Solana logic.
 */

function str(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/$/, "") : null;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Official Arc public mainnet RPC (docs.arc.network/integrate/connect-to-arc). */
export const ARC_MAINNET_RPC = "https://rpc.mainnet.arc.io";

export const ARC_CHAIN = {
  /** Official mainnet constants (never guessed — see docs). */
  chainId: 5042,
  chainIdHex: "0x13b2",
  name: "Arc",
  explorerUrl: "https://explorer.arc.io",
  testnetChainId: 5042002,
  testnetRpc: "https://rpc.testnet.arc.io",
  testnetExplorerUrl: "https://explorer.testnet.arc.io",
  /** Native gas token is USDC with 18 decimals on Arc. */
  gasSymbol: "USDC",
  gasDecimals: 18,
  /** ERC-20 USDC interface — 6 decimals, shares the native balance. */
  usdcErc20: "0x3600000000000000000000000000000000000000",
  usdcErc20Decimals: 6,
  /** EIP-7708 native-USDC Transfer system emitter (18 decimals). */
  usdcSystemEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
  transferTopic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  /** DexScreener chain identifier for Arc (verified live). */
  dexscreenerChain: "arc",
} as const;

export const ARC_CONFIG = {
  /** Chain identity — explicit, never mixed with Solana logic. */
  chain: "arc" as const,
  network: "mainnet" as const,
  chainId: ARC_CHAIN.chainId,
  /** Arc JSON-RPC endpoint. Official public endpoint works; set
      RECODE_ARC_RPC_URL (e.g. Alchemy arc-mainnet) for production throughput. */
  rpcUrl: str("RECODE_ARC_RPC_URL") ?? ARC_MAINNET_RPC,
  dexscreenerUrl: str("RECODE_DEXSCREENER_URL") ?? "https://api.dexscreener.com",
  /** How many Arc tokens the screener tracks (discovery cap). */
  maxTokens: num("RECODE_ARC_MAX_TOKENS", 120),
  /** USDC whale threshold for large-transfer events (face-value USD). */
  whaleThresholdUsd: num("RECODE_ARC_WHALE_THRESHOLD_USD", 25_000),
  /** Discovery / markets refresh cadence. */
  discoveryMs: num("RECODE_ARC_DISCOVERY_INTERVAL_MS", 600_000),
  marketsMs: num("RECODE_ARC_MARKETS_INTERVAL_MS", 60_000),
  /** USDC whale-transfer scan cadence (recent-block eth_getLogs window). */
  whalesMs: num("RECODE_ARC_WHALES_INTERVAL_MS", 60_000),
  /** Blocks scanned per whale cycle (bounded — respects provider limits). */
  whaleScanBlocks: num("RECODE_ARC_WHALE_SCAN_BLOCKS", 30),
  /** Retention. */
  retention: {
    historyMs: 30 * 24 * 3_600_000,
    whales: 300,
    stablecoin: 500,
    signals: 200,
  },
  userAgent:
    process.env.RECODE_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  requestTimeoutMs: num("RECODE_REQUEST_TIMEOUT_MS", 12_000),
} as const;