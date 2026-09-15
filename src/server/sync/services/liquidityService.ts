import { asEvmAddress, asFiniteNumber, asNonEmptyString } from "../util";
import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";

export async function syncLiquidity(store: SyncStore, indexer: IndexerProvider): Promise<number> {
  const raw = await indexer.liquidity();
  if (!raw) return 0;
  const d = store.get();
  const now = Date.now();
  let updated = 0;
  for (const [address, rec] of Object.entries(raw)) {
    const total = asFiniteNumber(rec.total);
    const prev = d.liquidity[address];
    if (total == null && !prev) continue;
    const symbol = asNonEmptyString(rec.symbol) ?? prev?.symbol ?? d.markets[address]?.symbol ?? "";
    const pools = Array.isArray(rec.pools)
      ? rec.pools
          .map((p) => {
            const r = p as Record<string, unknown>;
            return {
              address: asEvmAddress(r.address) ?? address,
              dex: asNonEmptyString(r.dex),
              liquidityUsd: asFiniteNumber(r.liquidityUsd),
            };
          })
          .filter((p) => p.liquidityUsd != null)
          .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
          .slice(0, 10)
      : (prev?.pools ?? []);
    d.liquidity[address] = {
      address,
      symbol,
      total,
      buy: asFiniteNumber(rec.buy),
      sell: asFiniteNumber(rec.sell),
      change24h: asFiniteNumber(rec.change24h),
      providers: asFiniteNumber(rec.providers),
      pools,
      updatedAt: now,
    };
    if (total != null) {
      const history = (d.liquidityHistory[address] ??= []);
      history.push({ t: now, total });
      d.liquidityHistory[address] = history.slice(-720);
    }
    updated += 1;
  }
  if (updated > 0) store.save();
  return updated;
}