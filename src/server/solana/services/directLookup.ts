import { bestPair, marketFields, type DexPair } from "../providers/dexscreener";
import type { SolanaRpcProvider } from "../providers/solanaRpc";
import type { SolanaStore } from "../store";
import type { SolanaHolders, SolanaToken } from "../types";

/**
 * ============================================================
 * SOLANA — direct mint lookup (arbitrary valid CA)
 * ============================================================
 * Resolves ANY valid Solana mint — not just the tracked universe:
 *   1. DexScreener pairs for the mint (live market data; works for
 *      tokens never indexed by the background scanner)
 *   2. Best (most liquid) pair as the primary market; the other
 *      pairs are preserved separately — metrics are never merged
 *   3. Solana RPC for holder concentration (largest accounts +
 *      supply) and mint metadata (decimals/supply)
 *   4. The token is upserted into the verified store so Radar,
 *      Whale Activity, Smart Money and the AI tools can reference it
 *
 * Three honest outcomes:
 *   found      — market pair(s) resolved
 *   mint-only  — mint exists on-chain but has no market pair
 *   not-found  — no provider can resolve the mint
 *
 * Short-lived in-memory cache (30s) + provider backoff prevent
 * hammering DexScreener/RPC on repeated lookups. Nulls stay null.
 */

export type DirectLookupStatus = "found" | "mint-only" | "not-found";

export interface DirectLookupPair {
  dexId: string | null;
  pairAddress: string | null;
  quoteToken: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  pairCreatedAt: number | null;
}

export interface DirectLookupResult {
  chain: "solana";
  mint: string;
  status: DirectLookupStatus;
  /** Primary (most liquid) market state — null when no pair exists. */
  token: SolanaToken | null;
  metadata: {
    name: string | null;
    symbol: string | null;
    logoUrl: string | null;
    decimals: number | null;
    supply: number | null;
  };
  /** All discovered pairs, most liquid first (primary is [0]). */
  pairs: DirectLookupPair[];
  pairsTotal: number;
  holders: SolanaHolders | null;
  /** Errors encountered while resolving optional data (never fabricated). */
  errors: string[];
  sources: string[];
  resolvedAt: number;
}

export interface DirectLookupProviders {
  dexscreener: {
    tokenPairs(mints: string[]): Promise<DexPair[]>;
    search(query: string): Promise<DexPair[]>;
  };
  rpc: Pick<SolanaRpcProvider, "getTokenInfo" | "getLargestAccounts" | "resolveOwners">;
  store?: SolanaStore;
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; result: DirectLookupResult }>();

export function clearDirectLookupCache(): void {
  cache.clear();
}

function pairsFromDex(pairs: DexPair[], mint: string): DirectLookupPair[] {
  const mine = pairs.filter((p) => p.baseToken.address === mint);
  const mapped = mine.map((p) => ({
    dexId: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    quoteToken: p.quoteToken?.symbol ?? null,
    priceUsd:
      p.priceUsd != null && Number.isFinite(Number(p.priceUsd)) ? Number(p.priceUsd) : null,
    liquidityUsd: p.liquidity?.usd ?? null,
    volume24hUsd: p.volumeUsd?.h24 ?? null,
    pairCreatedAt: p.pairCreatedAt ?? null,
  }));
  return mapped.sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1));
}

function tokenFromPair(
  mint: string,
  pair: DexPair,
  fields: ReturnType<typeof marketFields>,
  metadata: { decimals: number | null; supply: number | null },
  now: number,
  source: string,
): SolanaToken {
  return {
    mint,
    symbol: pair.baseToken.symbol ?? null,
    name: pair.baseToken.name ?? null,
    logoUrl: fields.logoUrl,
    decimals: metadata.decimals,
    priceUsd: fields.priceUsd,
    marketCap: fields.marketCap,
    fdv: fields.fdv,
    liquidityUsd: fields.liquidityUsd,
    volume24hUsd: fields.volume24hUsd,
    volume6hUsd: fields.volume6hUsd,
    volume1hUsd: fields.volume1hUsd,
    change24hPct: fields.change24hPct,
    buys24h: fields.buys24h,
    sells24h: fields.sells24h,
    txns24h: fields.txns24h,
    dexId: fields.dexId,
    pairAddress: fields.pairAddress,
    pairCreatedAt: fields.pairCreatedAt,
    websites: fields.websites,
    socials: fields.socials,
    supply: metadata.supply,
    firstSeen: now,
    updatedAt: now,
    sources: [source],
  };
}

/** Upsert a direct-lookup token into the verified store (fill, don't clobber richer engine data). */
export function upsertDirectToken(store: SolanaStore, token: SolanaToken, now: number): void {
  const d = store.get();
  const existing = d.tokens[token.mint];
  if (existing) {
    existing.symbol = token.symbol ?? existing.symbol;
    existing.name = token.name ?? existing.name;
    existing.logoUrl = token.logoUrl ?? existing.logoUrl;
    existing.priceUsd = token.priceUsd ?? existing.priceUsd;
    existing.marketCap = token.marketCap ?? existing.marketCap;
    existing.fdv = token.fdv ?? existing.fdv;
    existing.liquidityUsd = token.liquidityUsd ?? existing.liquidityUsd;
    existing.volume24hUsd = token.volume24hUsd ?? existing.volume24hUsd;
    existing.volume6hUsd = token.volume6hUsd ?? existing.volume6hUsd;
    existing.volume1hUsd = token.volume1hUsd ?? existing.volume1hUsd;
    existing.change24hPct = token.change24hPct ?? existing.change24hPct;
    existing.buys24h = token.buys24h ?? existing.buys24h;
    existing.sells24h = token.sells24h ?? existing.sells24h;
    existing.txns24h = token.txns24h ?? existing.txns24h;
    existing.dexId = token.dexId ?? existing.dexId;
    existing.pairAddress = token.pairAddress ?? existing.pairAddress;
    existing.pairCreatedAt = token.pairCreatedAt ?? existing.pairCreatedAt;
    existing.supply = token.supply ?? existing.supply;
    existing.updatedAt = now;
    existing.sources = [...new Set([...existing.sources, ...token.sources])].slice(-4);
    if (token.priceUsd != null) {
      (d.priceHistory[token.mint] ??= []).push({ t: now, p: token.priceUsd });
    }
  } else {
    d.tokens[token.mint] = { ...token, firstSeen: now };
  }
  d.updatedAt = now;
  store.save();
}

/**
 * Resolve any valid Solana mint. Never throws — failures surface as
 * status "not-found" with the reason in `errors`.
 */
export async function directLookup(
  mint: string,
  providers: DirectLookupProviders,
  now: number = Date.now(),
): Promise<DirectLookupResult> {
  const cached = cache.get(mint);
  if (cached && now - cached.at <= CACHE_TTL_MS) return cached.result;

  const errors: string[] = [];
  const sources: string[] = [];

  // 1. Live DEX pairs — token endpoint first, search as fallback.
  let pairs: DexPair[] = [];
  try {
    pairs = await providers.dexscreener.tokenPairs([mint]);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "pair lookup failed");
  }
  if (pairs.length === 0) {
    try {
      pairs = await providers.dexscreener.search(mint);
    } catch {
      /* fallback failure surfaced via empty pairs */
    }
  }
  const myPairs = pairsFromDex(pairs, mint);
  const best = bestPair(pairs, mint);

  // 2. Mint metadata / on-chain existence from Solana RPC.
  const info = await providers.rpc.getTokenInfo(mint);

  let status: DirectLookupStatus;
  let token: SolanaToken | null = null;
  let holders: SolanaHolders | null = null;

  if (best) {
    status = "found";
    const fields = marketFields(best);
    const meta = { decimals: info?.decimals ?? null, supply: info?.supply ?? null };
    const tkn = tokenFromPair(mint, best, fields, meta, now, "dexscreener:direct-lookup");
    token = tkn;
    sources.push("dexscreener");

    // Holder concentration via the existing RPC architecture (optional data).
    const largest = await providers.rpc.getLargestAccounts(mint);
    if (largest) {
      const owners = await providers.rpc.resolveOwners(largest.map((l) => l.address));
      const supply = info?.supply ?? tkn.supply;
      holders = {
        mint,
        symbol: tkn.symbol,
        supply,
        top: largest.map((l) => ({
          address: owners.get(l.address) ?? null,
          tokenAccount: l.address,
          balance: l.amount.uiAmount,
          sharePct:
            l.amount.uiAmount != null && supply != null && supply > 0
              ? (l.amount.uiAmount / supply) * 100
              : null,
          usd:
            l.amount.uiAmount != null && tkn.priceUsd != null
              ? l.amount.uiAmount * tkn.priceUsd
              : null,
        })),
        updatedAt: now,
      };
      if (tkn.supply == null && supply != null) tkn.supply = supply;
    } else {
      errors.push("holder data unavailable (RPC rate limit or offline)");
    }
  } else if (info != null) {
    // Valid mint account on-chain, but no DEX market pair anywhere.
    status = "mint-only";
  } else {
    status = "not-found";
    if (errors.length === 0) errors.push("no market pair and mint not resolvable on-chain");
  }

  const metadata = {
    name: token?.name ?? best?.baseToken.name ?? null,
    symbol: token?.symbol ?? best?.baseToken.symbol ?? null,
    logoUrl: token?.logoUrl ?? null,
    decimals: info?.decimals ?? null,
    supply: info?.supply ?? token?.supply ?? null,
  };

  const result: DirectLookupResult = {
    chain: "solana",
    mint,
    status,
    token,
    metadata,
    pairs: myPairs.slice(0, 8),
    pairsTotal: myPairs.length,
    holders,
    errors,
    sources,
    resolvedAt: now,
  };

  // 3. Upsert into the verified store so the rest of the intelligence
  //    system (radar, whales, smart money, AI) can reference the token.
  if (token && providers.store) {
    try {
      upsertDirectToken(providers.store, token, now);
    } catch {
      /* store failures never break the lookup */
    }
  }

  cache.set(mint, { at: now, result });
  if (cache.size > CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return result;
}