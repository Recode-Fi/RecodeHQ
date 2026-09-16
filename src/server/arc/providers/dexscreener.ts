import { ARC_CONFIG, ARC_CHAIN } from "../config";

/**
 * ============================================================
 * ARC — DexScreener market-data provider (chain: "arc")
 * ============================================================
 * Same verified keyless provider used by the Solana layer, filtered
 * to DexScreener's "arc" chain id (verified live — USDC 0x3600…0000
 * is the standard quote token on Arc pairs). Fields the provider
 * omits stay null — nothing is guessed or defaulted to zero.
 */

export interface ArcDexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken?: { address: string; symbol?: string };
  priceUsd?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volumeUsd?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export class ArcDexScreenerProvider {
  private nextAllowedAt = 0;
  ok: boolean | null = null;
  lastError: string | null = null;

  constructor(private readonly base: string = ARC_CONFIG.dexscreenerUrl) {}

  private async get<T>(path: string): Promise<T | null> {
    if (Date.now() < this.nextAllowedAt) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ARC_CONFIG.requestTimeoutMs);
      const res = await fetch(`${this.base}${path}`, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { "user-agent": ARC_CONFIG.userAgent },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        this.nextAllowedAt = Date.now() + 15_000;
        this.ok = false;
        this.lastError = `HTTP ${res.status}`;
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      this.ok = true;
      this.lastError = null;
      return json;
    } catch (err) {
      this.ok = false;
      this.lastError = err instanceof Error ? err.message : "request failed";
      return null;
    }
  }

  /** Discover Arc pairs via search (DexScreener has no per-chain listing endpoint). */
  async discoverPairs(): Promise<ArcDexPair[] | null> {
    const seen = new Set<string>();
    const out: ArcDexPair[] = [];
    for (const q of ["ARC USDC", "arc"]) {
      const json = await this.get<{ pairs?: ArcDexPair[] }>(
        `/latest/dex/search?q=${encodeURIComponent(q)}`,
      );
      if (!json?.pairs) continue;
      for (const p of json.pairs) {
        if (p.chainId !== ARC_CHAIN.dexscreenerChain) continue;
        const key = p.baseToken?.address?.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
        if (out.length >= ARC_CONFIG.maxTokens) return out;
      }
    }
    return out;
  }

  /** Live pairs for specific token contracts (batch, max 30). */
  async tokens(addresses: string[]): Promise<ArcDexPair[] | null> {
    if (addresses.length === 0) return [];
    const json = await this.get<{ pairs?: ArcDexPair[] }>(
      `/latest/dex/tokens/${addresses.map((a) => a.toLowerCase()).join(",")}`,
    );
    if (!json?.pairs) return null;
    return json.pairs.filter((p) => p.chainId === ARC_CHAIN.dexscreenerChain);
  }
}

/** Extract normalized market fields from a pair — null stays null. */
export function arcMarketFields(p: ArcDexPair) {
  const t = p.txns ?? {};
  const buys = t.h24?.buys ?? null;
  const sells = t.h24?.sells ?? null;
  return {
    priceUsd: num(p.priceUsd),
    marketCap: num(p.marketCap),
    fdv: num(p.fdv),
    liquidity: num(p.liquidity?.usd),
    volume24h: num(p.volumeUsd?.h24),
    change24hPct: num(p.priceChange?.h24),
    buys24h: buys,
    sells24h: sells,
    txns24h: buys != null && sells != null ? buys + sells : null,
    dexId: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    quoteToken: p.quoteToken?.symbol ?? null,
    pairCreatedAt: p.pairCreatedAt ?? null,
    logoUrl: p.info?.imageUrl ?? null,
  };
}

/** Strongest pair = highest liquidity (consistent primary-market rule). */
export function bestArcPair(pairs: ArcDexPair[]): ArcDexPair | null {
  if (pairs.length === 0) return null;
  return [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
}