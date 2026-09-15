import { SOLANA_CONFIG } from "../config";
import { getSolanaStore } from "../store";
import type { SolanaStore } from "../store";
import type { SolanaSyncEngine } from "../engine";
import { upsertDirectToken } from "./directLookup";
import { bestPair, marketFields, type DexPair } from "../providers/dexscreener";

/**
 * ============================================================
 * SOLANA — batched market resolution for wallet holdings
 * ============================================================
 * Resolves symbol/name/logo/price/24h change for a wallet's SPL
 * mints using ONLY exact-mint matches:
 *   1. Engine store (fresh verified price → zero provider calls)
 *   2. DexScreener batched pair lookup (up to 30 mints/call) with
 *      best-pair selection per mint; results are upserted into the
 *      verified store so Radar/Whales/Smart Money/AI can use them
 * Symbol-only or name-only matches are never used. No verified
 * exact-mint market → price null, status "no-market".
 */

export interface WalletTokenMarket {
  mint: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  /** "no-market-found" = provider responded, no exact-mint pair exists. */
  source: "store" | "dexscreener" | "no-market-found" | null;
}

const FRESH_MS = SOLANA_CONFIG.priceFreshnessMs;

export async function resolveWalletTokenMarkets(
  engine: SolanaSyncEngine,
  mints: string[],
  storeOverride?: SolanaStore,
): Promise<Map<string, WalletTokenMarket>> {
  const store = storeOverride ?? getSolanaStore();
  const out = new Map<string, WalletTokenMarket>();
  const d = store.get();
  const now = Date.now();
  const pending: string[] = [];

  for (const mint of mints) {
    const t = d.tokens[mint];
    if (t && t.priceUsd != null && now - t.updatedAt <= FRESH_MS) {
      out.set(mint, {
        mint,
        symbol: t.symbol,
        name: t.name,
        logoUrl: t.logoUrl,
        priceUsd: t.priceUsd,
        change24hPct: t.change24hPct,
        marketCap: t.marketCap,
        liquidityUsd: t.liquidityUsd,
        source: "store",
      });
    } else if (pending.length < 60) {
      pending.push(mint);
    }
  }

  // Batched DexScreener resolution (30 mints per call, API cap).
  for (let i = 0; i < pending.length; i += 30) {
    const chunk = pending.slice(i, i + 30);
    try {
      const pairs: DexPair[] = await engine.dexscreener.tokenPairs(chunk);
      const byMint = new Map<string, DexPair[]>();
      for (const p of pairs) {
        const arr = byMint.get(p.baseToken.address) ?? [];
        arr.push(p);
        byMint.set(p.baseToken.address, arr);
      }
      for (const mint of chunk) {
        const best = bestPair(byMint.get(mint) ?? [], mint);
        if (!best) {
          // Provider responded; no exact-mint pair exists → "no-market".
          out.set(mint, {
            mint,
            symbol: null,
            name: null,
            logoUrl: null,
            priceUsd: null,
            change24hPct: null,
            marketCap: null,
            liquidityUsd: null,
            source: "no-market-found",
          });
          continue;
        }
        const f = marketFields(best);
        upsertDirectToken(
          store,
          {
            mint,
            symbol: best.baseToken.symbol ?? null,
            name: best.baseToken.name ?? null,
            logoUrl: f.logoUrl,
            decimals: null,
            priceUsd: f.priceUsd,
            marketCap: f.marketCap,
            fdv: f.fdv,
            liquidityUsd: f.liquidityUsd,
            volume24hUsd: f.volume24hUsd,
            volume6hUsd: f.volume6hUsd,
            volume1hUsd: f.volume1hUsd,
            change24hPct: f.change24hPct,
            buys24h: f.buys24h,
            sells24h: f.sells24h,
            txns24h: f.txns24h,
            dexId: f.dexId,
            pairAddress: f.pairAddress,
            pairCreatedAt: f.pairCreatedAt,
            websites: f.websites,
            socials: f.socials,
            supply: null,
            firstSeen: now,
            updatedAt: now,
            sources: [`dexscreener:${best.dexId}`],
          },
          now,
        );
        out.set(mint, {
          mint,
          symbol: best.baseToken.symbol ?? null,
          name: best.baseToken.name ?? null,
          logoUrl: f.logoUrl,
          priceUsd: f.priceUsd,
          change24hPct: f.change24hPct,
          marketCap: f.marketCap,
          liquidityUsd: f.liquidityUsd,
          source: "dexscreener",
        });
      }
    } catch {
      // Provider failed (rate limit/offline) — every pending mint in this
      // chunk stays unpriced; the UI shows "No verified market price".
      for (const mint of chunk) {
        if (!out.has(mint)) {
          out.set(mint, {
            mint,
            symbol: null,
            name: null,
            logoUrl: null,
            priceUsd: null,
            change24hPct: null,
            marketCap: null,
            liquidityUsd: null,
            source: null,
          });
        }
      }
    }
  }
  return out;
}