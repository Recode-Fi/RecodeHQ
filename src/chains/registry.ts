/**
 * ============================================================
 * CHAIN ABSTRACTION — network registry
 * ============================================================
 * The UI contains no chain-specific logic. Each network entry
 * declares how its data is produced (live engine chain vs.
 * ecosystem integration vs. future EVM chain), so pages render
 * per-network states from configuration alone.
 */

// Official network brand SVGs from @web3icons/core (raw SVG strings):
// Solana (SOL token mark) and Robinhood Chain (official Robinhood network
// icon — the feather mark in chain brand color #CF0).
import solanaIcon from "@web3icons/core/svgs/tokens/branded/SOL.svg";
import robinhoodChainIcon from "@web3icons/core/svgs/networks/branded/robinhood.svg";
import arcIcon from "@web3icons/core/svgs/networks/branded/arc.svg";
import ethereumIcon from "@web3icons/core/svgs/networks/branded/ethereum.svg";
import bscIcon from "@web3icons/core/svgs/networks/branded/binance-smart-chain.svg";
import arbitrumIcon from "@web3icons/core/svgs/networks/branded/arbitrum-one.svg";

export interface NetworkConfig {
  id: string;
  name: string;
  shortName: string;
  /** "chain" = live network; "ecosystem" = protocol/token integration. */
  kind: "chain" | "ecosystem";
  /** Address family — EVM networks and Solana never share address logic. */
  family: "evm" | "solana";
  chainId: number | null;
  chainIdHex: string | null;
  explorerUrl: string | null;
  /** Which sync-engine chain id feeds this network's data (null = none yet). */
  engineChainId: number | null;
  note: string;
  /** Optional official brand SVG string (from @web3icons/core). */
  icon?: string;
}

export const ALL_NETWORKS = "all";

/** Robinhood Chain — live, engine-indexed (chain id 4663). */
export const ROBINHOOD_CHAIN: NetworkConfig = {
  id: "robinhood-chain",
  name: "Robinhood Chain",
  shortName: "RHC",
  kind: "chain",
  family: "evm",
  chainId: 4663,
  chainIdHex: "0x1237",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  engineChainId: 4663,
  note: "Live EVM network. Indexed via the Robinhood Chain explorer + official stock-token API.",
  icon: robinhoodChainIcon,
};

/**
 * Solana — live non-EVM network (mainnet-beta).
 * Data comes from the dedicated Solana intelligence layer
 * (src/server/solana/): DexScreener DEX market data + Solana
 * JSON-RPC. Wallet connectivity is separate (Phantom/Solflare);
 * addresses are base58 mints — never processed as EVM contracts.
 */
export const SOLANA: NetworkConfig = {
  id: "solana",
  name: "Solana",
  shortName: "SOL",
  kind: "chain",
  family: "solana",
  chainId: null,
  chainIdHex: null,
  explorerUrl: "https://solscan.io",
  engineChainId: null,
  note: "Live non-EVM network. Indexed via DEX market data + Solana JSON-RPC (mainnet-beta).",
  icon: solanaIcon,
};

/**
 * Arc — Circle's USDC-gas Layer-1 (mainnet LIVE, chain 5042).
 * Official configuration from docs.arc.network / docs.arc.io:
 * RPC https://rpc.mainnet.arc.io (override via RECODE_ARC_RPC_URL),
 * explorer https://explorer.arc.io, native gas = USDC (18 decimals),
 * EVM-compatible (Osaka baseline) — uses the EVM address family and
 * the dedicated Arc intelligence layer (src/server/arc/).
 */
export const ARC: NetworkConfig = {
  id: "arc",
  name: "Arc",
  shortName: "ARC",
  kind: "chain",
  family: "evm",
  chainId: 5042,
  chainIdHex: "0x13b2",
  explorerUrl: "https://explorer.arc.io",
  engineChainId: 5042,
  note: "Live EVM network (Circle). USDC gas. Indexed via DexScreener (chain 'arc') + Arc JSON-RPC.",
  icon: arcIcon,
};

/**
 * Ethereum / BSC / Arbitrum — live EVM networks served by the generic
 * EVM NET layer (src/server/evmnet/): DexScreener markets + chain RPC.
 * Official values verified live (chain ids probed, explorers official):
 *   Ethereum 1 / etherscan.io / ETH · BSC 56 / bscscan.com / BNB ·
 *   Arbitrum One 42161 / arbiscan.io / ETH.
 */
export const ETHEREUM: NetworkConfig = {
  id: "ethereum",
  name: "Ethereum",
  shortName: "ETH",
  kind: "chain",
  family: "evm",
  chainId: 1,
  chainIdHex: "0x1",
  explorerUrl: "https://etherscan.io",
  engineChainId: 1,
  note: "Live EVM network. Indexed via DexScreener (chain 'ethereum') + Ethereum JSON-RPC.",
  icon: ethereumIcon,
};

export const BSC: NetworkConfig = {
  id: "bsc",
  name: "BNB Smart Chain",
  shortName: "BSC",
  kind: "chain",
  family: "evm",
  chainId: 56,
  chainIdHex: "0x38",
  explorerUrl: "https://bscscan.com",
  engineChainId: 56,
  note: "Live EVM network. Indexed via DexScreener (chain 'bsc') + BSC JSON-RPC.",
  icon: bscIcon,
};

export const ARBITRUM: NetworkConfig = {
  id: "arbitrum",
  name: "Arbitrum One",
  shortName: "ARB",
  kind: "chain",
  family: "evm",
  chainId: 42161,
  chainIdHex: "0xa4b1",
  explorerUrl: "https://arbiscan.io",
  engineChainId: 42161,
  note: "Live EVM network. Indexed via DexScreener (chain 'arbitrum') + Arbitrum JSON-RPC.",
  icon: arbitrumIcon,
};

/**
 * Future EVM chains register here with engineChainId set once their
 * indexer/provider is wired — no UI changes required.
 */
export const RESERVED_CHAINS: NetworkConfig[] = [];

export const NETWORKS: NetworkConfig[] = [
  SOLANA,
  ETHEREUM,
  BSC,
  ARBITRUM,
  ARC,
  ROBINHOOD_CHAIN,
  ...RESERVED_CHAINS,
];

/** EVM-net chains served by the generic EVM NET layer. */
export const EVM_NET_IDS = ["ethereum", "bsc", "arbitrum"] as const;

/** True when the given network id is a non-EVM family. */
export function isSolanaNetwork(id: string): boolean {
  return getNetwork(id)?.family === "solana";
}

export function getNetwork(id: string): NetworkConfig | null {
  return NETWORKS.find((n) => n.id === id) ?? null;
}

/** Does this network's data exist in the engine right now? */
export function networkIndexed(network: NetworkConfig, engineChainIds: number[]): boolean {
  return network.engineChainId != null && engineChainIds.includes(network.engineChainId);
}

/** True when a market row (chainId) belongs to the selected network. */
export function rowMatchesNetwork(rowChainId: number | null, selectedId: string): boolean {
  if (selectedId === ALL_NETWORKS) return true;
  const net = getNetwork(selectedId);
  if (!net) return true;
  if (net.engineChainId == null) return false;
  return rowChainId != null && rowChainId === net.engineChainId;
}
