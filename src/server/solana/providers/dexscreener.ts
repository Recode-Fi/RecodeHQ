import { SOLANA_CONFIG } from "../config";
import type { SolanaProviderState } from "../types";

/**
 * ============================================================
 * SOLANA — DexScreener market-data provider (keyless, verified live)
 * ============================================================
 * Sources:
 *   - GET /token-profiles/latest/v1  — discovered Solana token profiles
 *   - GET /token-boosts/latest/v1    — actively boosted (traded) tokens
 *   - GET /latest/dex/tokens/{mints} — live per-mint DEX pairs: price,
 *     liquidity, volume windows, buy/sell txns, 24h change, DEX id,
 *     pair address, pair age, market cap / FDV, token logo
 *   - GET /latest/dex/search?q=      — symbol/name/mint search
 *
 * 429/5xx trigger exponential backoff. Every field the provider omits
 * stays null — nothing is guessed or defaulted to zero.
 */

export interface DexPair {
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
  info?: {
    imageUrl?: string;
    websites?: { url: string }[];
    socials?: { type: string; url: string }[];
  };
}

export interface DexProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  description?: string;
  links?: { label?: string; type?: string; url: string }[];
}

export interface DexBoost extends DexProfile {
  amount?: number;
  totalAmount?: number;
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export class DexScreenerProvider {
  readonly state: SolanaProviderState;
  private nextAllowedAt = 0;

  constructor(private readonly base: string = SOLANA_CONFIG.dexscreenerUrl) {
    this.state = {
      configured: Boolean(base),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  get configured(): boolean {
    return Boolean(this.base);
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.base) throw new Error("DexScreener not configured");
    if (Date.now() < this.nextAllowedAt) {
      throw new Error("DexScreener backing off");
    }
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SOLANA_CONFIG.requestTimeoutMs);
      const res = await fetch(`${this.base}${path}`, {
        headers: {
          accept: "application/json",
          "user-agent": SOLANA_CONFIG.userAgent,
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) {
        this.state.ok = false;
        this.state.consecutiveFailures += 1;
        this.state.lastError = `HTTP ${res.status}`;
        const retryAfter = Number(res.headers.get("retry-after"));
        this.nextAllowedAt =
          Date.now() +
          (Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(300_000, 10_000 * 2 ** Math.min(this.state.consecutiveFailures, 5)));
        throw new Error(`DexScreener HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
      const json = (await res.json()) as T;
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return json;
    } catch (err) {
      this.state.ok = false;
      this.state.consecutiveFailures += 1;
      this.state.lastError = err instanceof Error ? err.message : "fetch failed";
      if (this.nextAllowedAt === 0) {
        this.nextAllowedAt =
          Date.now() + Math.min(300_000, 10_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
      }
      throw err;
    }
  }

  /** SOL wrapped-native mint — always tracked so SOL pricing is available. */
  static readonly WSOL_MINT = "So11111111111111111111111111111111111111112";

  /** Discovered Solana token profiles (icons + metadata), newest set. */
  async solanaProfiles(): Promise<DexProfile[]> {
    const all = await this.get<DexProfile[]>("/token-profiles/latest/v1");
    return (Array.isArray(all) ? all : []).filter((p) => p.chainId === "solana" && p.tokenAddress);
  }

  /** Actively boosted (trading-promoted) Solana tokens — the "hot" set. */
  async solanaBoosts(): Promise<DexBoost[]> {
    const all = await this.get<DexBoost[]>("/token-boosts/latest/v1");
    return (Array.isArray(all) ? all : []).filter((b) => b.chainId === "solana" && b.tokenAddress);
  }

  /**
   * Live DEX pairs for up to 30 mints (API batch cap). Returns only
   * pairs on Solana — the response may include other chains.
   */
  async tokenPairs(mints: string[]): Promise<DexPair[]> {
    if (mints.length === 0) return [];
    const capped = mints.slice(0, 30);
    const json = await this.get<{ pairs?: DexPair[] }>(
      `/latest/dex/tokens/${capped.map((m) => encodeURIComponent(m)).join(",")}`,
    );
    return (json.pairs ?? []).filter((p) => p.chainId === "solana" && p.baseToken?.address);
  }

  async search(query: string): Promise<DexPair[]> {
    const json = await this.get<{ pairs?: DexPair[] }>(
      `/latest/dex/search?q=${encodeURIComponent(query)}`,
    );
    return (json.pairs ?? []).filter((p) => p.chainId === "solana" && p.baseToken?.address);
  }
}

/** Best (most liquid) pair for one mint — the authoritative quote. */
export function bestPair(pairs: DexPair[], mint: string): DexPair | null {
  let best: DexPair | null = null;
  let bestLiq = -1;
  for (const p of pairs) {
    if (p.baseToken.address !== mint) continue;
    const liq = p.liquidity?.usd ?? 0;
    if (liq > bestLiq) {
      best = p;
      bestLiq = liq;
    }
  }
  return best;
}

/** Extract null-safe market fields from a pair response. */
export function marketFields(pair: DexPair | null): {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volume6hUsd: number | null;
  volume1hUsd: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  txns24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  dexId: string | null;
  pairAddress: string | null;
  pairCreatedAt: number | null;
  logoUrl: string | null;
  websites: string[] | null;
  socials: { type: string; url: string }[] | null;
} {
  if (!pair) {
    return {
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      volume6hUsd: null,
      volume1hUsd: null,
      change24hPct: null,
      buys24h: null,
      sells24h: null,
      txns24h: null,
      marketCap: null,
      fdv: null,
      dexId: null,
      pairAddress: null,
      pairCreatedAt: null,
      logoUrl: null,
      websites: null,
      socials: null,
    };
  }
  const h24 = pair.txns?.h24 ?? null;
  return {
    priceUsd: num(pair.priceUsd),
    liquidityUsd: num(pair.liquidity?.usd ?? null),
    volume24hUsd: num(pair.volumeUsd?.h24 ?? null),
    volume6hUsd: num(pair.volumeUsd?.h6 ?? null),
    volume1hUsd: num(pair.volumeUsd?.h1 ?? null),
    change24hPct: num(pair.priceChange?.h24 ?? null),
    buys24h: h24 ? num(h24.buys) : null,
    sells24h: h24 ? num(h24.sells) : null,
    txns24h: h24 ? num(h24.buys + h24.sells) : null,
    marketCap: num(pair.marketCap ?? null),
    fdv: num(pair.fdv ?? null),
    dexId: pair.dexId ?? null,
    pairAddress: pair.pairAddress ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    logoUrl: pair.info?.imageUrl ?? null,
    websites: pair.info?.websites?.map((w) => w.url).filter(Boolean) ?? null,
    socials:
      pair.info?.socials?.map((s) => ({ type: s.type, url: s.url })).filter((s) => s.url) ?? null,
  };
}