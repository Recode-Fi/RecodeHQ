import fs from "node:fs";
import path from "node:path";
import type { EvmNetStoreShape } from "./types";

/**
 * EVM NET — durable per-chain JSON store. Cache keys are chain-scoped
 * by file name (evmnet-<chain>.json) — no cross-chain cache sharing.
 */

const DIR = path.join(process.cwd(), ".recode-cache");

export class EvmNetStore {
  private data: EvmNetStoreShape | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(chainKey: string) {
    this.file = path.join(DIR, `evmnet-${chainKey}.json`);
  }

  get(): EvmNetStoreShape {
    if (!this.data) {
      let loaded: Partial<EvmNetStoreShape> = {};
      try {
        loaded = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<EvmNetStoreShape>;
      } catch {
        loaded = {};
      }
      this.data = {
        tokens: {},
        whales: [],
        stablecoin: [],
        radar: [],
        lastScannedBlock: null,
        updatedAt: null,
        ...loaded,
        version: 1,
      };
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
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch {
      /* cache write failures must never break syncing */
    }
  }

  prune(historyMs: number, whaleCap: number, stablecoinCap: number, signalCap: number): void {
    const d = this.get();
    const cutoff = Date.now() - historyMs;
    d.whales = d.whales.filter((x) => x.observedAt >= cutoff).slice(0, whaleCap);
    d.stablecoin = d.stablecoin.filter((x) => x.observedAt >= cutoff).slice(0, stablecoinCap);
    d.radar = d.radar.filter((x) => x.detectedAt >= cutoff).slice(0, signalCap);
    this.save();
  }
}

const globalStores = globalThis as unknown as {
  __recodeEvmNetStores?: Map<string, EvmNetStore>;
};

export function getEvmNetStore(chainKey: string): EvmNetStore {
  globalStores.__recodeEvmNetStores ??= new Map();
  const m = globalStores.__recodeEvmNetStores;
  if (!m.has(chainKey)) m.set(chainKey, new EvmNetStore(chainKey));
  return m.get(chainKey)!;
}