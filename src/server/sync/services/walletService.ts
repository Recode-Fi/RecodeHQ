import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";

export async function syncWallets(store: SyncStore, indexer: IndexerProvider): Promise<number> {
  const list = await indexer.wallets();
  if (!list) return 0;
  const d = store.get();
  d.wallets = Object.fromEntries(list.map((w) => [w.address, w]));
  store.save();
  return list.length;
}