import { ARC_CHAIN, ARC_CONFIG } from "../config";
import { ArcRpcProvider, type ArcTransferLog } from "../providers/arcRpc";

/**
 * ============================================================
 * ARC — Wallet activity (native-USDC movement records)
 * ============================================================
 * Builds activity records from the wallet's native-USDC Transfer
 * logs (EIP-7708 system emitter) over a bounded recent-block window.
 * Every record carries its real transaction hash + explorer link.
 * Honest limitation: no Arc indexer is configured, so history depth
 * is the scanned window — stated in the response, never faked.
 */

export interface ArcWalletActivityRecord {
  txHash: string;
  explorerUrl: string;
  blockNumber: number;
  action: "Received" | "Sent" | "Mint" | "Burn";
  amountUsdc: number;
  usd: number;
  counterparty: string | null;
  observedAt: number;
}

export interface ArcWalletActivity {
  chain: "arc";
  address: string;
  records: ArcWalletActivityRecord[];
  recordsCount: number;
  fromBlock: number | null;
  toBlock: number | null;
  updatedAt: number;
  errors: string[];
}

export async function fetchArcWalletActivity(
  rpc: ArcRpcProvider,
  address: string,
  latestBlock: number,
  blocks: number,
): Promise<ArcWalletActivity> {
  const toBlock = latestBlock;
  const fromBlock = Math.max(0, latestBlock - blocks);
  const logs = await rpc.getUsdcTransfers(fromBlock, toBlock, address);
  if (logs == null) {
    return {
      chain: "arc",
      address,
      records: [],
      recordsCount: 0,
      fromBlock,
      toBlock,
      updatedAt: Date.now(),
      errors: [
        "USDC activity window unavailable (RPC rate limit or error)",
        `rpc.lastError=${rpc.state.lastError ?? "none"}`,
      ],
    };
  }
  const records: ArcWalletActivityRecord[] = logs
    .filter((l) => l.from === address || l.to === address)
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .map((l: ArcTransferLog) => ({
      txHash: l.txHash,
      explorerUrl: `${ARC_CHAIN.explorerUrl}/tx/${l.txHash}`,
      blockNumber: l.blockNumber,
      action: l.to === address ? (l.from == null ? "Mint" : "Received") : l.to == null ? "Burn" : "Sent",
      amountUsdc: l.amountUsdc,
      usd: l.amountUsdc,
      counterparty: l.to === address ? l.from : l.to,
      observedAt: Date.now(),
    }));
  return {
    chain: "arc",
    address,
    records,
    recordsCount: records.length,
    fromBlock,
    toBlock,
    updatedAt: Date.now(),
    errors:
      records.length === 0
        ? [
            `No native-USDC movements found for this wallet in blocks ${fromBlock}–${toBlock}. History depth is limited to the scanned window (no Arc indexer configured).`,
          ]
        : [],
  };
}