/**
 * ============================================================
 * RECODE — Whale Activity provider abstraction (server-side)
 * ============================================================
 * A unified, evidence-based pipeline for live on-chain whale
 * activity on Robinhood Chain (4663). Providers only produce
 * events they can PROVE from their source; the sync layer
 * merges them with source labels and priority reconciliation.
 *
 * Data-integrity rules (enforced across the pipeline):
 *   • A transfer is BUY/SELL ONLY when actual DEX/swap evidence
 *     exists (pool/router counterparty, decoded swap method).
 *     Everything else is TRANSFER — never guessed.
 *   • USD is CALCULATED = amount × verified RECODE price, or
 *     null when no verified price exists. Never provider-guessed,
 *     never zero.
 *   • Every event carries its source id and (where available) a
 *     real block timestamp.
 */

export type WhaleAction = "buy" | "sell" | "transfer";

/** One verified on-chain token transfer, normalized. */
export interface WhaleTransferEvent {
  /** Stable event identity: `${txHash}:${logIndex}` (deterministic). */
  id: string;
  hash: string;
  /** Real block timestamp in ms when the source provides it. */
  ts: number;
  /** "block" when ts comes from the chain; "ingest" when it is the
      moment the event was observed (raw logs carry no timestamp). */
  tsBasis: "block" | "ingest";
  from: string;
  to: string;
  /** From-side contract/label name when the source provides it. */
  fromName: string | null;
  toName: string | null;
  fromIsContract: boolean;
  toIsContract: boolean;
  /** Normalized token amount (whole tokens). */
  amount: number;
  symbol: string | null;
  /** Token contract address. */
  address: string;
  /** DEX-swap evidence verdict (never guessed — see classify). */
  action: WhaleAction;
  /** Human-readable evidence for the verdict, or null for TRANSFER. */
  actionBasis: string | null;
  /** Which provider produced this event. */
  source: string;
  /** Decoded parent-tx method when the explorer provides it (evidence). */
  method: string | null;
}

export interface WhaleMarketRef {
  address: string;
  symbol: string | null;
  decimals: number | null;
}

export interface WhaleTransferQuery {
  markets: WhaleMarketRef[];
  /** Return events newer than this (ms epoch); 0 = no filter. */
  sinceTs: number;
  /** Max events per market per cycle. */
  limitPerMarket: number;
}

/** A whale-activity data source. All methods are server-side only. */
export interface WhaleActivityProvider {
  readonly name: string;
  /** Fetch recent normalized transfers for the given markets. */
  getTransfers(query: WhaleTransferQuery): Promise<WhaleTransferEvent[] | null>;
}

/** Merge priority — higher replaces lower on the same event id. */
export const SOURCE_PRIORITY: Record<string, number> = {
  "robinhood-indexer": 4,
  blockscout: 3,
  "goldsky-subgraph": 2,
  "rpc-getlogs": 1,
};
