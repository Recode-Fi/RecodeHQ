import type { GoldskyTokenIntelligence } from "../../providers/goldsky";
import type {
  WhaleActivityProvider,
  WhaleMarketRef,
  WhaleTransferEvent,
  WhaleTransferQuery,
} from "../types";

/**
 * ============================================================
 * Whale provider #2 — Goldsky hosted subgraph (Robinhood Chain)
 * ============================================================
 * Goldsky officially supports Robinhood Chain mainnet (chain
 * 4663 — goldsky.com/chains: "Subgraphs, Turbo, Compose, Edge").
 * The RECODE-deployed subgraph (goldsky-subgraph/ in this repo)
 * indexes every verified Stock Token's Transfer events from
 * genesis with real block timestamps + tx hashes.
 *
 * Raw Transfer events carry NO trade direction, so every event
 * from this provider is honestly labeled TRANSFER — the
 * Blockscout provider (which sees verified DEX contract names)
 * upgrades the same event id to BUY/SELL when evidence exists.
 */
export class GoldskyWhaleProvider implements WhaleActivityProvider {
  readonly name = "goldsky-subgraph";

  constructor(private readonly goldsky: GoldskyTokenIntelligence) {}

  async getTransfers(query: WhaleTransferQuery): Promise<WhaleTransferEvent[] | null> {
    const out: WhaleTransferEvent[] = [];
    for (const market of query.markets) {
      let rows: Awaited<ReturnType<typeof this.goldsky.getTransfers>> = null;
      try {
        rows = await this.goldsky.getTransfers(market.address, query.limitPerMarket);
      } catch {
        continue; // provider backoff/error — other sources still flow
      }
      if (!rows) continue;
      for (const row of rows) {
        if (!row.id || !row.ts || row.ts <= 0) continue;
        if (row.amount == null || !Number.isFinite(row.amount) || row.amount <= 0) continue;
        if (query.sinceTs > 0 && row.ts < query.sinceTs) continue;
        out.push({
          id: row.id,
          hash: row.hash ?? row.id,
          ts: row.ts,
          tsBasis: "block",
          from: row.from,
          to: row.to,
          fromName: null,
          toName: null,
          fromIsContract: false,
          toIsContract: false,
          amount: row.amount,
          symbol: market.symbol,
          address: market.address,
          action: "transfer",
          actionBasis: null,
          source: "goldsky-subgraph",
          method: null,
        });
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }
}
