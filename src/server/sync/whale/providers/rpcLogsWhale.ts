import type { RpcProvider } from "../../providers/rpc";
import type { SyncStore } from "../../store";
import { SYNC_CONFIG } from "../../config";
import type {
  WhaleActivityProvider,
  WhaleMarketRef,
  WhaleTransferEvent,
  WhaleTransferQuery,
} from "../types";

/**
 * ============================================================
 * Whale provider #3 — raw chain logs (eth_getLogs fallback)
 * ============================================================
 * The configured Alchemy/RPC endpoint (server-side key) scans
 * ERC-20 Transfer logs incrementally per market. Raw logs carry
 * NO timestamps and NO trade direction, so events are honestly
 * labeled TRANSFER with ingest-time ts — the Blockscout/Goldsky
 * sources upgrade the same event id to real timestamps and
 * swap evidence when they observe it too.
 */
export class RpcLogsWhaleProvider implements WhaleActivityProvider {
  readonly name = "rpc-getlogs";

  constructor(
    private readonly rpc: RpcProvider,
    private readonly store: SyncStore,
  ) {}

  async getTransfers(query: WhaleTransferQuery): Promise<WhaleTransferEvent[] | null> {
    if (!this.rpc.state.configured) return null;
    const latest = await this.rpc.latestBlock();
    if (latest == null) return null;

    const d = this.store.get();
    const out: WhaleTransferEvent[] = [];
    const MAX_RANGE = 5_000;
    const ingestTs = Date.now();

    for (const market of query.markets) {
      const cursor = d.transferCursors[market.address];
      const from = cursor == null ? Math.max(0, latest - 100) : Math.min(cursor + 1, latest);
      const to = Math.min(latest, from + MAX_RANGE);
      d.transferCursors[market.address] = to;
      if (to <= from) continue;
      const logs = await this.rpc.transferLogs(market.address, from, to);
      if (!logs || logs.length === 0) continue;
      const decimals = market.decimals ?? 18;

      for (const log of logs) {
        let amount: number | null = null;
        try {
          amount = Number(BigInt(log.valueRaw)) / 10 ** decimals;
        } catch {
          continue;
        }
        if (!Number.isFinite(amount) || amount <= 0) continue;
        out.push({
          id: `${log.txHash}:${log.logIndex ?? `${log.from.slice(0, 10)}${log.to.slice(0, 10)}`}`,
          hash: log.txHash,
          ts: ingestTs,
          tsBasis: "ingest",
          from: log.from,
          to: log.to,
          fromName: null,
          toName: null,
          fromIsContract: false,
          toIsContract: false,
          amount,
          symbol: market.symbol,
          address: market.address,
          action: "transfer",
          actionBasis: null,
          source: "rpc-getlogs",
          method: null,
        });
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }
}

/** Markets ref helper for the sync entrypoint (keeps callers lean). */
export function whaleMarketRefs(
  markets: { address: string; symbol: string | null; decimals: number | null }[],
): WhaleMarketRef[] {
  return markets.map((m) => ({ address: m.address, symbol: m.symbol, decimals: m.decimals }));
}

/** Re-export so the sync entrypoint reads the threshold from one place. */
export const WHALE_THRESHOLD_USD = () => SYNC_CONFIG.whaleThresholdUsd;
