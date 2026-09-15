import { asEvmAddress, asFiniteNumber, asNonEmptyString } from "../util";
import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";

export async function syncHolders(
  store: SyncStore,
  indexer: IndexerProvider,
  addresses: string[],
  maxPerCycle: number,
): Promise<number> {
  const d = store.get();
  const now = Date.now();
  let updated = 0;
  for (const address of addresses.slice(0, maxPerCycle)) {
    const raw = await indexer.holders(address);
    if (!raw) continue;
    const total = asFiniteNumber(raw.total);
    const symbol = asNonEmptyString(raw.symbol) ?? d.markets[address]?.symbol ?? "";
    const top = Array.isArray(raw.top)
      ? raw.top
          .map((e) => {
            const r = e as Record<string, unknown>;
            return {
              address: asEvmAddress(r.address),
              sharePct: asFiniteNumber(r.sharePct),
              balance: asFiniteNumber(r.balance),
              usd: asFiniteNumber(r.usd),
            };
          })
          .filter((e) => e.address != null || e.sharePct != null)
          .slice(0, 100)
      : [];
    d.holders[address] = {
      address,
      symbol,
      total,
      new24h: asFiniteNumber(raw.new24h),
      lost24h: asFiniteNumber(raw.lost24h),
      growthPct: asFiniteNumber(raw.growthPct),
      concentration: asFiniteNumber(raw.concentration),
      top,
      updatedAt: now,
    };
    if (total != null) {
      const history = (d.holderHistory[address] ??= []);
      history.push({ t: now, holders: total });
      d.holderHistory[address] = history.slice(-720);
    }
    updated += 1;
  }
  if (updated > 0) store.save();
  return updated;
}