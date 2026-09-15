import fs from "node:fs";
import path from "node:path";
import type {
  SolanaHolders,
  SolanaLiquidityPoint,
  SolanaPricePoint,
  SolanaRadarSignal,
  SolanaToken,
  SolanaVolumePoint,
  SolanaWhaleEvent,
} from "./types";

export interface SolanaStoreShape {
  version: 1;
  tokens: Record<string, SolanaToken>;
  priceHistory: Record<string, SolanaPricePoint[]>;
  volumeHistory: Record<string, SolanaVolumePoint[]>;
  liquidityHistory: Record<string, SolanaLiquidityPoint[]>;
  holders: Record<string, SolanaHolders>;
  /** Previous-cycle largest-account balances per mint (whale-delta evidence). */
  largestSnapshots: Record<string, Record<string, number>>;
  whales: SolanaWhaleEvent[];
  radar: SolanaRadarSignal[];
  updatedAt: number | null;
}

const DIR = path.join(process.cwd(), ".recode-cache");
const FILE = path.join(DIR, "solana-store.json");

function emptyShape(): SolanaStoreShape {
  return {
    version: 1,
    tokens: {},
    priceHistory: {},
    volumeHistory: {},
    liquidityHistory: {},
    holders: {},
    largestSnapshots: {},
    whales: [],
    radar: [],
    updatedAt: null,
  };
}

/**
 * Durable JSON cache for the Solana intelligence layer. Mirrors the EVM
 * SyncStore: single-process, atomic writes, debounced persistence.
 */
export class SolanaStore {
  private data: SolanaStoreShape | null = null;
  private timer: NodeJS.Timeout | null = null;

  get(): SolanaStoreShape {
    if (!this.data) {
      let loaded: Partial<SolanaStoreShape> = {};
      try {
        loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<SolanaStoreShape>;
      } catch {
        loaded = {};
      }
      this.data = { ...emptyShape(), ...loaded, version: 1 };
    }
    return this.data;
  }

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

  prune(historyMs: number, whaleCap: number, signalCap: number): void {
    const d = this.get();
    const cutoff = Date.now() - historyMs;
    for (const key of Object.keys(d.priceHistory)) {
      d.priceHistory[key] = d.priceHistory[key].filter((p) => p.t >= cutoff);
    }
    for (const key of Object.keys(d.volumeHistory)) {
      d.volumeHistory[key] = d.volumeHistory[key].filter((p) => p.t >= cutoff);
    }
    for (const key of Object.keys(d.liquidityHistory)) {
      d.liquidityHistory[key] = d.liquidityHistory[key].filter((p) => p.t >= cutoff);
    }
    d.whales = d.whales.filter((w) => w.observedAt >= cutoff).slice(0, whaleCap);
    d.radar = d.radar.filter((s) => s.detectedAt >= cutoff).slice(0, signalCap);
    this.save();
  }
}

const globalStore = globalThis as unknown as { __recodeSolanaStore?: SolanaStore };

export function getSolanaStore(): SolanaStore {
  globalStore.__recodeSolanaStore ??= new SolanaStore();
  return globalStore.__recodeSolanaStore;
}
