import type { EvmChainConfig } from "../types";

/**
 * EVM NET — DexScreener market-data provider (chain-parameterized).
 * Same verified keyless provider as Solana/Arc, filtered to the
 * chain's DexScreener id ("ethereum" | "bsc" | "arbitrum" — probed
 * live). Omitted fields stay null — nothing guessed, no zeros.
 */

export interface EvmNetDexPair {
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

export function evmNetMarketFields(p: EvmNetDexPair) {
  const buys = p.txns?.h24?.buys ?? null;
  const sells = p.txns?.h24?.sells ?? null;
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

export class EvmNetDexScreenerProvider {
  private nextAllowedAt = 0;
  ok: boolean | null = null;
  lastError: string | null = null;

  constructor(
    private readonly cfg: EvmChainConfig,
    private readonly base: string,
    private readonly maxTokens: number,
    private readonly timeoutMs: number,
    private readonly userAgent: string,
  ) {}

  private async get<T>(path: string): Promise<T | null> {
    if (Date.now() < this.nextAllowedAt) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const res = await fetch(`${this.base}${path}`, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { "user-agent": this.userAgent },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        this.nextAllowedAt = Date.now() + 15_000;
        this.ok = false;
        this.lastError = `HTTP ${res.status}`;
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.ok = true;
      this.lastError = null;
      return (await res.json()) as T;
    } catch (err) {
      this.ok = false;
      this.lastError = err instanceof Error ? err.message : "request failed";
      return null;
    }
  }

  /** Discovery via multi-seed search, filtered to this chain (keyless, verified). */
  async discoverPairs(): Promise<EvmNetDexPair[] | null> {
    const seen = new Set<string>();
    const out: EvmNetDexPair[] = [];
    for (const q of this.cfg.discoverySeeds ?? [this.cfg.name, this.cfg.dexscreenerChain]) {
      const json = await this.get<{ pairs?: EvmNetDexPair[] }>(
        `/latest/dex/search?q=${encodeURIComponent(q)}`,
      );
      if (!json?.pairs) continue;
      for (const p of json.pairs) {
        if (p.chainId !== this.cfg.dexscreenerChain) continue;
        const key = p.baseToken?.address?.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
        if (out.length >= this.maxTokens) return out;
      }
    }
    return out;
  }

  /** Live pairs for specific token contracts (batch, max 30, 0x kept). */
  async tokens(addresses: string[]): Promise<EvmNetDexPair[] | null> {
    if (addresses.length === 0) return [];
    const json = await this.get<{ pairs?: EvmNetDexPair[] }>(
      `/latest/dex/tokens/${addresses.map((a) => a.toLowerCase()).join(",")}`,
    );
    if (!json?.pairs) return null;
    return json.pairs.filter((p) => p.chainId === this.cfg.dexscreenerChain);
  }
}