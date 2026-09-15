import fs from "node:fs";
import path from "node:path";
import type {
  SyncCandle,
  SyncDiscoveryEvent,
  SyncHolders,
  SyncHolderPoint,
  SyncLiquidity,
  SyncLiquidityPoint,
  SyncMarket,
  SyncUnderlying,
  SyncPrice,
  SyncTx,
  SyncWallet,
  SyncWhale,
} from "./types";

export interface SyncStoreShape {
  version: 1;
  markets: Record<string, SyncMarket>;
  prices: Record<string, SyncPrice>;
  priceHistory: Record<string, { t: number; price: number }[]>;
  liquidity: Record<string, SyncLiquidity>;
  liquidityHistory: Record<string, SyncLiquidityPoint[]>;
  holders: Record<string, SyncHolders>;
  holderHistory: Record<string, SyncHolderPoint[]>;
  transactions: SyncTx[];
  whales: SyncWhale[];
  wallets: Record<string, SyncWallet>;
  discovery: SyncDiscoveryEvent[];
  /** Per-market underlying security market cap (from market-data providers). */
  underlyingMcaps: Record<string, SyncUnderlying>;
  /** OHLCV history per (address, tf). source: price-feed | observed-ticks | underlying-market. */
  candles: Record<string, { updatedAt: number; candles: SyncCandle[]; source?: string }>;
  /** Per-market last-scanned block for Alchemy eth_getLogs syncing. */
  transferCursors: Record<string, number>;
  /** Per-market resolved reachable logo URL (probed, cached). */
  logos: Record<string, { url: string | null; checkedAt: number }>;
  /** Per-market underlying company metadata (verified provider sector/industry). */
  underlyingMeta: Record<
    string,
    { sector: string | null; industry: string | null; updatedAt: number; source: string }
  >;
  /** RWA category aggregates (CoinGecko/RWA.xyz), cached across refreshes. */
  rwaAggregates?: import("./services/rwaAggregateService").RwaAggregatesShape;
  /** Cross-chain RWA asset universe (CoinGecko category discovery), cached. */
  universe?: import("./services/universeService").UniverseShape;
}

const DIR = path.join(process.cwd(), ".recode-cache");
const FILE = path.join(DIR, "sync-store.json");

function emptyShape(): SyncStoreShape {
  return {
    version: 1,
    markets: {},
    prices: {},
    priceHistory: {},
    candles: {},
    liquidity: {},
    liquidityHistory: {},
    holders: {},
    holderHistory: {},
    transactions: [],
    whales: [],
    wallets: {},
    discovery: [],
    underlyingMcaps: {},
    transferCursors: {},
    logos: {},
    underlyingMeta: {},
  };
}

/**
 * Durable JSON cache for the sync engine. Single-process, atomic writes,
 * debounced persistence. Models map 1:1 to the requested data set
 * (markets, prices, candles, liquidity, holders, transactions, whales, wallets).
 */
export class SyncStore {
  private data: SyncStoreShape | null = null;
  private timer: NodeJS.Timeout | null = null;

  get(): SyncStoreShape {
    if (!this.data) {
      let loaded: Partial<SyncStoreShape> = {};
      try {
        loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<SyncStoreShape>;
      } catch {
        loaded = {};
      }
      this.data = { ...emptyShape(), ...loaded, version: 1 };
    }
    return this.data;
  }

  /** Debounced persistence â€” batches bursty task writes. */
  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 400);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  flush(): void {
    if (!this.data) return;
    try {
      fs.mkdirSync(DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, FILE);
    } catch {
      /* cache write failures must never break syncing */
    }
  }

  prune(historyMs: number, txCap: number, whaleCap: number, discoveryCap: number): void {
    const d = this.get();
    const cutoff = Date.now() - historyMs;
    for (const key of Object.keys(d.liquidityHistory)) {
      d.liquidityHistory[key] = d.liquidityHistory[key].filter((p) => p.t >= cutoff);
    }
    for (const key of Object.keys(d.holderHistory)) {
      d.holderHistory[key] = d.holderHistory[key].filter((p) => p.t >= cutoff);
    }
    for (const key of Object.keys(d.candles)) {
      d.candles[key].candles = d.candles[key].candles.filter((c) => c.t >= cutoff);
    }
    d.transactions = d.transactions.slice(0, txCap);
    d.whales = d.whales.slice(0, whaleCap);
    d.discovery = d.discovery.slice(0, discoveryCap);
    this.save();
  }
}

const globalStore = globalThis as unknown as { __recodeSyncStore?: SyncStore };

export function getSyncStore(): SyncStore {
  globalStore.__recodeSyncStore ??= new SyncStore();
  return globalStore.__recodeSyncStore;
}