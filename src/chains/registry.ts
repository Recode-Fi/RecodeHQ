/**
 * ============================================================
 * CHAIN ABSTRACTION — network registry
 * ============================================================
 * The UI contains no chain-specific logic. Each network entry
 * declares how its data is produced (live engine chain vs.
 * ecosystem integration vs. future EVM chain), so pages render
 * per-network states from configuration alone.
 */

// Official Solana brand SVG (SOL token mark) from @web3icons/core.
import solanaIcon from "@web3icons/core/svgs/tokens/branded/SOL.svg";

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
 * STONK ecosystem — protocol/token integration layer, NOT a blockchain.
 * Data is config-driven until the ecosystem token contract is verified,
 * at which point the engine indexes it like any other market.
 */
export const STONK_ECOSYSTEM: NetworkConfig = {
  id: "stonk",
  name: "STONK Ecosystem",
  shortName: "STONK",
  kind: "ecosystem",
  family: "evm",
  chainId: null,
  chainIdHex: null,
  explorerUrl: null,
  engineChainId: null,
  note: "Protocol and token integration layer on Robinhood Chain infrastructure. Not an independent blockchain.",
};

/**
 * Future EVM chains register here with engineChainId set once their
 * indexer/provider is wired — no UI changes required.
 */
export const RESERVED_CHAINS: NetworkConfig[] = [];

export const NETWORKS: NetworkConfig[] = [
  SOLANA,
  ROBINHOOD_CHAIN,
  STONK_ECOSYSTEM,
  ...RESERVED_CHAINS,
];

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
