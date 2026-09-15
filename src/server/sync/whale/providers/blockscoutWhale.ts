import type { BlockscoutProvider, BlockscoutTransfer } from "../../providers/blockscout";
import { classifyTransfer } from "../classify";
import type {
  WhaleActivityProvider,
  WhaleMarketRef,
  WhaleTransferEvent,
  WhaleTransferQuery,
} from "../types";

/**
 * ============================================================
 * Whale provider #1 — Robinhood Chain explorer (Blockscout v2)
 * ============================================================
 * PRIMARY source. `GET /api/v2/tokens/{address}/transfers` is
 * verified live on robinhoodchain.blockscout.com and returns:
 * from/to addresses WITH verified contract names (e.g.
 * "RamsesV3Pool"), decoded parent-tx methods, REAL block
 * timestamps and token snapshots. No credentials required.
 * This is the only source that can PROVE buy/sell, so it gets
 * the highest merge priority among chain readers.
 */
export class BlockscoutWhaleProvider implements WhaleActivityProvider {
  readonly name = "blockscout";

  constructor(private readonly blockscout: BlockscoutProvider) {}

  async getTransfers(query: WhaleTransferQuery): Promise<WhaleTransferEvent[] | null> {
    const marketByAddress = new Map<string, WhaleMarketRef>(
      query.markets.map((m) => [m.address.toLowerCase(), m]),
    );
    const out: WhaleTransferEvent[] = [];
    for (const market of query.markets) {
      const rows = await this.blockscout.transfers(market.address, Math.min(query.limitPerMarket, 100));
      if (!rows) continue;
      for (const row of rows) {
        const event = normalizeBlockscoutTransfer(row, marketByAddress.get(market.address.toLowerCase()) ?? market);
        if (event) out.push(event);
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }
}

/** Map one explorer transfer row to the normalized event shape. */
export function normalizeBlockscoutTransfer(
  row: BlockscoutTransfer,
  market: WhaleMarketRef,
): WhaleTransferEvent | null {
  const verdict = classifyTransfer({
    from: row.from,
    to: row.to,
    fromName: row.fromName,
    toName: row.toName,
    fromIsContract: row.fromIsContract,
    toIsContract: row.toIsContract,
  });
  return {
    id: row.id,
    hash: row.txHash,
    ts: row.ts,
    tsBasis: "block",
    from: row.from,
    to: row.to,
    fromName: row.fromName,
    toName: row.toName,
    fromIsContract: row.fromIsContract,
    toIsContract: row.toIsContract,
    amount: row.amount,
    symbol: market.symbol,
    address: market.address,
    action: verdict.action,
    actionBasis: verdict.basis,
    source: "blockscout",
    method: null,
  };
}
