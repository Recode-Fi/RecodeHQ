import fs from "node:fs";
import path from "node:path";
import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { IndexerProvider } from "../providers/indexer";
import type { RpcProvider } from "../providers/rpc";
import type { SyncAssetType, SyncDiscoveryEvent, SyncMarket, SyncPrice } from "../types";
import { asEvmAddress, asNonEmptyString } from "../util";

const ASSET_TYPES: readonly string[] = [
  "tokenized-stock", "etf", "treasury", "bond", "commodity", "fund", "private-credit", "other",
];

function normalizeType(v: string | null): SyncAssetType {
  const s = (v ?? "").toLowerCase().replace(/\s+/g, "-");
  return (ASSET_TYPES as readonly string[]).includes(s) ? (s as SyncAssetType) : "unknown";
}

/** Upsert a market record. Returns true when the market is newly discovered. */
export function upsertMarket(
  store: SyncStore,
  market: Partial<Omit<SyncMarket, "address" | "chainId" | "firstSeen">> & { address: string },
  source: SyncMarket["source"],
): boolean {
  const d = store.get();
  const key = market.address.toLowerCase();
  const existing = d.markets[key];
  d.markets[key] = {
    ...existing,
    ...market,
    address: key,
    chainId: SYNC_CONFIG.chainId,
    source: existing?.source ?? source,
    firstSeen: existing?.firstSeen ?? Date.now(),
    status: existing?.status ?? "active",
  };
  return !existing;
}

export function recordDiscovery(store: SyncStore, addresses: string[]): void {
  if (addresses.length === 0) return;
  const d = store.get();
  const now = Date.now();
  const events: SyncDiscoveryEvent[] = addresses.map((address) => ({
    address,
    symbol: d.markets[address]?.symbol ?? null,
    firstSeen: d.markets[address]?.firstSeen ?? now,
    liquidity: d.liquidity[address]?.total ?? null,
    volume24h: d.prices[address]?.volume24h ?? null,
    holders: d.holders[address]?.total ?? null,
  }));
  d.discovery = [...events, ...d.discovery].slice(0, SYNC_CONFIG.retention.discovery);
  for (const e of events) {
    console.log(
      `[recode] NEW MARKET DETECTED ${e.symbol ?? e.address} Â· firstSeen ${new Date(e.firstSeen).toISOString()}`,
    );
  }
}

/**
 * Market discovery. Sources (all optional): local registry file
 * `markets.robinhood-chain.json`, `RECODE_MARKET_LIST_URL`, the indexer,
 * and symbols observed on the price feed.
 */
export async function syncDiscovery(
  store: SyncStore,
  indexer: IndexerProvider,
  priceItems: SyncPrice[],
  marketListUrl: string | null,
): Promise<{ discovered: number }> {
  const fresh: string[] = [];

  try {
    const file = path.join(process.cwd(), "markets.robinhood-chain.json");
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
        markets?: { address?: string; symbol?: string; name?: string; assetType?: string; underlying?: string; verified?: boolean }[];
      };
      for (const m of parsed.markets ?? []) {
        const address = asEvmAddress(m.address);
        if (!address) continue;
        if (
          upsertMarket(store, {
            address,
            symbol: asNonEmptyString(m.symbol),
            name: asNonEmptyString(m.name),
            assetType: normalizeType(m.assetType ?? null),
            underlying: asNonEmptyString(m.underlying),
            verified: m.verified === true,
          }, "registry")
        ) {
          fresh.push(address);
        }
      }
    }
  } catch {
    /* optional registry */
  }

  if (marketListUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(marketListUrl, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) {
        const parsed = (await res.json()) as {
          markets?: { address?: string; symbol?: string; name?: string; assetType?: string; underlying?: string }[];
        };
        for (const m of parsed.markets ?? []) {
          const address = asEvmAddress(m.address);
          if (!address) continue;
          if (
            upsertMarket(store, {
              address,
              symbol: asNonEmptyString(m.symbol),
              name: asNonEmptyString(m.name),
              assetType: normalizeType(m.assetType ?? null),
              underlying: asNonEmptyString(m.underlying),
            }, "registry")
          ) {
            fresh.push(address);
          }
        }
      }
    } catch {
      /* optional remote list */
    }
  }

  const indexed = await indexer.markets();
  if (indexed) {
    for (const m of indexed) {
      if (
        upsertMarket(store, {
          address: m.address,
          symbol: m.symbol,
          name: m.name,
          assetType: normalizeType(m.assetType),
          underlying: m.underlying,
          circulatingSupply: m.circulatingSupply,
        }, "indexer")
      ) {
        fresh.push(m.address);
      }
    }
  }

  for (const p of priceItems) {
    if (upsertMarket(store, { address: p.address, symbol: p.symbol }, "price-feed")) {
      fresh.push(p.address);
    }
  }

  recordDiscovery(store, fresh);
  store.save();
  return { discovered: fresh.length };
}

/** On-chain ERC-20 metadata refresh over RPC (batched, oldest first). */
export async function syncMetadata(
  store: SyncStore,
  rpc: RpcProvider,
  batch: number,
  staleMs: number,
): Promise<number> {
  if (!rpc.state.configured) return 0;
  const d = store.get();
  const now = Date.now();
  const targets = Object.values(d.markets)
    .filter((m) => m.lastSynced == null || now - m.lastSynced > staleMs)
    .sort((a, b) => (a.lastSynced ?? 0) - (b.lastSynced ?? 0))
    .slice(0, batch);
  let updated = 0;
  for (const market of targets) {
    const meta = await rpc.tokenMetadata(market.address);
    if (!meta) continue;
    const current = d.markets[market.address];
    if (!current) continue;
    d.markets[market.address] = {
      ...current,
      name: meta.name ?? current.name,
      symbol: meta.symbol ?? current.symbol,
      decimals: meta.decimals ?? current.decimals,
      totalSupply: meta.totalSupply ?? current.totalSupply,
      lastSynced: now,
    };
    updated += 1;
  }
  if (updated > 0) store.save();
  return updated;
}