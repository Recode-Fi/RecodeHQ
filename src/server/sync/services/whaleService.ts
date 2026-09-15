import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";
import type { SyncWhale } from "../types";

const KINDS: readonly string[] = ["accumulation", "distribution", "buy", "sell", "transfer"];

function normalizeKind(v: string | null): SyncWhale["kind"] {
  return v && KINDS.includes(v) ? (v as SyncWhale["kind"]) : "transfer";
}

export async function syncWhales(store: SyncStore, indexer: IndexerProvider): Promise<number> {
  const d = store.get();
  const since = d.whales[0]?.ts ?? 0;
  const items = await indexer.whalesSince(since);
  if (!items || items.length === 0) return 0;
  const existing = new Set(d.whales.map((w) => w.id));
  const fresh = items
    .filter((w) => !existing.has(w.id))
    .map((w) => ({ ...w, kind: normalizeKind(w.kind), source: "robinhood-indexer" }));
  if (fresh.length === 0) return 0;
  d.whales = [...fresh, ...d.whales].sort((a, b) => b.ts - a.ts).slice(0, SYNC_CONFIG.retention.whales);
  store.save();
  return fresh.length;
}