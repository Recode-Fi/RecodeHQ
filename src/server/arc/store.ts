import fs from "node:fs";
import path from "node:path";

/**
 * ============================================================
 * ARC — durable JSON store (mirrors the Solana store pattern)
 * ============================================================
 */

export interface ArcToken {
  address: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  decimals: number | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  txns24h: number | null;
  dexId: string | null;
  pairAddress: string | null;
  quoteToken: string | null;
  pairCreatedAt: number | null;
  updatedAt: number | null;
  sources: string[];
}

export interface ArcWhaleEvent {
  kind: "transfer" | "mint" | "burn";
  /** USDC amount in face-value USDC (6-decimal representation). */
  amountUsdc: number;
  /** Face-value USD (USDC transfers ARE USD-denominated on Arc). */
  usd: number;
  from: string | null;
  to: string | null;
  txHash: string;
  blockNumber: number;
  /** Evidence basis — always the system emitter Transfer log. */
  source: string;
  observedAt: number;
}

export interface ArcStablecoinEvent {
  kind: "inflow" | "outflow" | "transfer" | "mint" | "burn";
  wallet: string;
  counterparty: string | null;
  amountUsdc: number;
  usd: number;
  txHash: string;
  blockNumber: number;
  observedAt: number;
}

export interface ArcRadarSignal {
  id: string;
  kind:
    | "unusual-volume"
    | "liquidity-change"
    | "large-transfer"
    | "whale-activity"
    | "price-movement"
    | "newly-active";
  severity: "high" | "notable" | "info";
  token: string | null;
  symbol: string | null;
  message: string;
  basis: string;
  detectedAt: number;
}

export interface ArcStoreShape {
  version: 1;
  tokens: Record<string, ArcToken>;
  whales: ArcWhaleEvent[];
  stablecoin: ArcStablecoinEvent[];
  radar: ArcRadarSignal[];
  lastScannedBlock: number | null;
  updatedAt: number | null;
}

const DIR = path.join(process.cwd(), ".recode-cache");
const FILE = path.join(DIR, "arc-store.json");

function emptyShape(): ArcStoreShape {
  return {
    version: 1,
    tokens: {},
    whales: [],
    stablecoin: [],
    radar: [],
    lastScannedBlock: null,
    updatedAt: null,
  };
}

export class ArcStore {
  private data: ArcStoreShape | null = null;
  private timer: NodeJS.Timeout | null = null;

  get(): ArcStoreShape {
    if (!this.data) {
      let loaded: Partial<ArcStoreShape> = {};
      try {
        loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<ArcStoreShape>;
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

  prune(historyMs: number, whaleCap: number, stablecoinCap: number, signalCap: number): void {
    const d = this.get();
    const cutoff = Date.now() - historyMs;
    d.whales = d.whales.filter((w) => w.observedAt >= cutoff).slice(0, whaleCap);
    d.stablecoin = d.stablecoin.filter((e) => e.observedAt >= cutoff).slice(0, stablecoinCap);
    d.radar = d.radar.filter((s) => s.detectedAt >= cutoff).slice(0, signalCap);
    this.save();
  }
}

const globalStore = globalThis as unknown as { __recodeArcStore?: ArcStore };

export function getArcStore(): ArcStore {
  globalStore.__recodeArcStore ??= new ArcStore();
  return globalStore.__recodeArcStore;
}