import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";
import type { SyncTxAction } from "../types";

const ACTIONS: readonly string[] = ["buy", "sell", "transfer", "mint", "burn"];

function normalizeAction(v: string | null): SyncTxAction {
  return v && ACTIONS.includes(v) ? (v as SyncTxAction) : "transfer";
}

export async function syncTransactions(
  store: SyncStore,
  indexer: IndexerProvider,
): Promise<number> {
  const d = store.get();
  const since = d.transactions[0]?.ts ?? 0;
  const items = await indexer.transactionsSince(since);
  if (!items || items.length === 0) return 0;
  const existing = new Set(d.transactions.map((t) => t.id));
  const fresh = items
    .filter((t) => !existing.has(t.hash))
    .map((t) => ({ id: t.hash, ...t, action: normalizeAction(t.action), source: "robinhood-indexer" }));
  if (fresh.length === 0) return 0;
  d.transactions = [...fresh, ...d.transactions]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, SYNC_CONFIG.retention.transactions);
  store.save();
  return fresh.length;
}