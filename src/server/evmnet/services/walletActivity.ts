import { EVM_NET_CHAINS, type EvmNetChainKey } from "../config";
import { EvmNetRpcProvider } from "../providers/evmRpc";

/**
 * EVM NET — Wallet activity per chain: canonical-stablecoin movements
 * involving the wallet, read over a bounded recent-block window.
 * Every record carries its real tx hash + explorer link; history
 * depth is honestly limited to the indexed window.
 */

export interface EvmNetWalletActivity {
  chain: EvmNetChainKey;
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

export async function fetchEvmNetWalletActivity(
  chain: EvmNetChainKey,
  rpc: EvmNetRpcProvider,
  rawAddress: string,
  latestBlock: number,
  blocks: number,
): Promise<EvmNetWalletActivity> {
  const cfg = EVM_NET_CHAINS[chain];
  const address = rawAddress.toLowerCase();
  const toBlock = latestBlock;
  const fromBlock = Math.max(0, latestBlock - blocks);
  const logs = await rpc.getStablecoinTransfers(fromBlock, toBlock, address);
  if (logs == null) {
    return {
      chain,
      address,
      records: [],
      recordsCount: 0,
      fromBlock,
      toBlock,
      updatedAt: Date.now(),
      errors: [
        `${cfg.whaleSymbol} activity window unavailable (RPC rate limit or error)`,
        `rpc.lastError=${rpc.state.lastError ?? "none"}`,
      ],
    };
  }
  const records = logs
    .filter((l) => l.from === address || l.to === address)
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .map((l) => ({
      txHash: l.txHash,
      explorerUrl: `${cfg.explorerUrl}/tx/${l.txHash}`,
      blockNumber: l.blockNumber,
      action: (l.to === address
        ? l.from == null
          ? "Mint"
          : "Received"
        : l.to == null
          ? "Burn"
          : "Sent") as "Received" | "Sent" | "Mint" | "Burn",
      symbol: cfg.whaleSymbol,
      amount: l.amount,
      usd: l.amount,
      counterparty: l.to === address ? l.from : l.to,
      observedAt: Date.now(),
    }));
  return {
    chain,
    address,
    records,
    recordsCount: records.length,
    fromBlock,
    toBlock,
    updatedAt: Date.now(),
    errors:
      records.length === 0
        ? [
            `No ${cfg.whaleSymbol} movements found for this wallet in blocks ${fromBlock}–${toBlock}. Historical activity is limited to the available indexed window.`,
          ]
        : [],
  };
}