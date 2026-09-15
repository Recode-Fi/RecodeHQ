import { hexToBigInt } from "./providers/rpc";
import { SYNC_CONFIG } from "./config";
import type { SyncMarket, SyncPrice } from "./types";

export interface LiveOverview {
  marketsIndexed: number;
  marketsWithPrice: number;
  totalMarketCap: number | null;
  totalFdv: number | null;
  totalVolume24h: number | null;
  totalLiquidity: number | null;
  liquidityConfigured: boolean;
  totalHolders: number | null;
  activeWallets: number | null;
  transactionsToday: number | null;
  whaleTransactionsToday: number | null;
  updatedAt: number;
}

function supplyNumber(market: SyncMarket, supply: string | null): number | null {
  if (!supply || market.decimals == null) return null;
  try {
    const raw = hexToBigInt(supply.startsWith("0x") ? supply : `0x${BigInt(supply).toString(16)}`);
    return raw == null ? null : Number(raw) / 10 ** market.decimals;
  } catch {
    const n = Number(supply);
    return Number.isFinite(n) && market.decimals != null ? n / 10 ** market.decimals : null;
  }
}

export function computeFdv(market: SyncMarket, price: SyncPrice | undefined): number | null {
  if (!price) return null;
  const supply = supplyNumber(market, market.totalSupply);
  return supply != null && supply > 0 ? price.price * supply : null;
}

function startOfUtcDay(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Aggregates dashboard metrics strictly from synchronized store values. */
export function computeLiveOverview(
  store: ReturnType<typeof import("./store").getSyncStore>,
): LiveOverview {
  const d = store.get();
  let totalMarketCap: number | null = null;
  let totalFdv: number | null = null;
  let marketsWithPrice = 0;

  for (const market of Object.values(d.markets)) {
    const price = d.prices[market.address];
    if (!price) continue;
    marketsWithPrice += 1;
    // verified per-token market cap straight from the explorer snapshot
    if (price.marketCap != null) {
      totalMarketCap = (totalMarketCap ?? 0) + price.marketCap;
    }
    const fdv = computeFdv(market, price);
    if (fdv != null) {
      totalFdv = (totalFdv ?? 0) + fdv;
    }
  }

  let totalVolume24h: number | null = null;
  for (const price of Object.values(d.prices)) {
    if (price.volume24h != null) totalVolume24h = (totalVolume24h ?? 0) + price.volume24h;
  }

  let totalLiquidity: number | null = null;
  for (const liquidity of Object.values(d.liquidity)) {
    if (liquidity.total != null) totalLiquidity = (totalLiquidity ?? 0) + liquidity.total;
  }

  let totalHolders: number | null = null;
  for (const holders of Object.values(d.holders)) {
    if (holders.total != null) totalHolders = (totalHolders ?? 0) + holders.total;
  }

  const walletList = Object.values(d.wallets);
  const activeWallets = walletList.length
    ? walletList.filter((w) => w.lastActive != null && Date.now() - w.lastActive < 86_400_000).length
    : null;

  const dayStart = startOfUtcDay();
  const transactionsToday = d.transactions.length
    ? d.transactions.filter((t) => t.ts >= dayStart).length
    : null;
  const whaleTransactionsToday = d.whales.length
    ? d.whales.filter(
        (w) => w.ts >= dayStart && w.usd != null && w.usd >= SYNC_CONFIG.whaleThresholdUsd,
      ).length
    : null;

  return {
    marketsIndexed: Object.keys(d.markets).length,
    marketsWithPrice,
    totalMarketCap,
    totalFdv,
    totalVolume24h,
    totalLiquidity,
    totalHolders,
    activeWallets,
    transactionsToday,
    whaleTransactionsToday,
    liquidityConfigured: Boolean(SYNC_CONFIG.indexerUrl),
    updatedAt: Date.now(),
  };
}