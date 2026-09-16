/**
 * ============================================================
 * $RECODE token resolver — DIRECT contract-address lookup
 * ============================================================
 * The official RECODE token is resolved BY CONTRACT ADDRESS:
 *   official address → DexScreener token pairs (exact base match)
 *                    → live market snapshot
 * It must NOT depend on the token being present in the static
 * tracked-token registry. Resolution order:
 *   1. DexScreener /tokens/{address} (keyless, exact base match)
 * Cross-chain safety: the pair's DexScreener chain id IS the token's
 * real deployment chain and is mapped to the registry chain id —
 * data is never attributed to a chain the token is not on.
 * Integrity: missing fields stay null — never 0, never estimated.
 */

export const DEXSCREENER_CHAIN_TO_ID: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  arbitrum: 42161,
  arc: 5042,
  robinhood: 4663,
};

export interface RecodeResolvedMarket {
  priceUsd: number | null;
  change24hPct: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  dexId: string | null;
  pairAddress: string | null;
  /** Registry chain id when the deployment chain is known to RECODE. */
  chainId: number | null;
  /** Raw DexScreener chain id — always present, mapped or not. */
  dexscreenerChain: string;
  pairsTotal: number;
}

interface DexPair {
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

/**
 * PURE: normalize DexScreener pairs into a market snapshot for the
 * queried address. EXACT base-token match only — pairs where the
 * address appears as the QUOTE token (e.g. everything priced against
 * USDC) are excluded so another token's market can never be attached.
 * The strongest (most liquid) exact pair is the primary market; its
 * metrics are never mixed with other pairs.
 */
export function mapRecodePairs(
  pairs: DexPair[],
  address: string,
): RecodeResolvedMarket | null {
  const addr = address.toLowerCase();
  const own = pairs.filter(
    (p) => p.chainId != null && p.baseToken?.address?.toLowerCase() === addr,
  );
  if (own.length === 0) return null;
  const best = [...own].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const chainId = DEXSCREENER_CHAIN_TO_ID[best.chainId] ?? null;
  return {
    priceUsd: num(best.priceUsd),
    change24hPct: num(best.priceChange?.h24),
    marketCap: num(best.marketCap),
    fdv: num(best.fdv),
    volume24h: num(best.volumeUsd?.h24),
    liquidityUsd: num(best.liquidity?.usd),
    symbol: best.baseToken.symbol ?? null,
    name: best.baseToken.name ?? null,
    logoUrl: best.info?.imageUrl ?? null,
    dexId: best.dexId ?? null,
    pairAddress: best.pairAddress ?? null,
    chainId,
    dexscreenerChain: best.chainId,
    pairsTotal: own.length,
  };
}

/** Live DexScreener lookup for one contract address (keyless). */
export async function resolveRecodeToken(
  address: string,
  baseUrl = "https://api.dexscreener.com",
  timeoutMs = 10_000,
): Promise<RecodeResolvedMarket | null | "provider-unavailable"> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/latest/dex/tokens/${address.toLowerCase()}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (res.status === 429 || res.status >= 500) return "provider-unavailable";
    if (!res.ok) return null;
    const json = (await res.json()) as { pairs?: DexPair[] };
    if (!json?.pairs) return null;
    return mapRecodePairs(json.pairs, address);
  } catch {
    return "provider-unavailable";
  }
}