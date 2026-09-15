import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";
import type { BlockscoutProvider } from "../providers/blockscout";
import type { RobinhoodStockTokenProvider } from "../providers/robinhood";
import { recordDiscovery } from "./rwaService";
import { underlyingAssetTypeOf } from "./underlyingService";
import type { SyncMarket } from "../types";

/** Throttled server-side diagnostics for the RHJ price task. */
let rhjLastLogAt = 0;
let rhjCycle = 0;

/** Splits "Apple â€¢ Robinhood Token" into the underlying asset name. */
function underlyingOf(name: string): string {
  return name.replace(/\s*â€¢\s*Robinhood Token\s*$/i, "").trim();
}

function assetTypeOf(name: string): SyncMarket["assetType"] {
  const n = name.toLowerCase();
  if (n.includes("treasury")) return "treasury";
  if (n.includes("etf") || n.includes("fund")) return "etf";
  if (n.includes("gold") || n.includes("silver") || n.includes("oil")) return "commodity";
  return "tokenized-stock";
}

/** Normalizes a raw supply string (decimal or hex) using token decimals (18 observed). */
export function normalizeSupply(raw: string | null, decimals: number | null): number | null {
  if (!raw) return null;
  try {
    const dec = decimals ?? 18;
    const big = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    const n = Number(big);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 10 ** dec;
  } catch {
    return null;
  }
}

/**
 * Registry discovery from the Robinhood Chain explorer: every admin-verified
 * "â€¢ Robinhood Token" with its official symbol (no "x" suffix), contract
 * address, logo and verified circulating market cap.
 */
export async function syncRobinhoodRegistry(
  store: SyncStore,
  blockscout: BlockscoutProvider,
): Promise<{ discovered: number; total: number }> {
  const registry = await blockscout.searchRegistry();
  if (!registry) return { discovered: 0, total: 0 };
  const d = store.get();
  let discovered = 0;
  for (const row of registry) {
    const existing = d.markets[row.address];
    if (!existing) discovered += 1;
    d.markets[row.address] = {
      ...(existing ?? {}),
      address: row.address,
      symbol: row.symbol,
      name: row.name,
      underlying: underlyingOf(row.name),
      underlyingSymbol: row.symbol,
      underlyingAssetType: underlyingAssetTypeOf(
        existing?.assetType && existing.assetType !== "unknown"
          ? existing.assetType
          : assetTypeOf(row.name),
      ),
      assetType: existing?.assetType && existing.assetType !== "unknown" ? existing.assetType : assetTypeOf(row.name),
      logoUrl: row.logoUrl,
      verified: row.verified,
      tokenStandard: "ERC-20",
      totalSupply: row.totalSupplyRaw,
      source: "indexer",
      chainId: SYNC_CONFIG.chainId,
      firstSeen: existing?.firstSeen ?? Date.now(),
      status: "active",
    };
  }
  store.save();
  return { discovered, total: registry.length };
}

/**
 * Price sync from verified explorer exchange rates. Appends every confirmed
 * tick to price history and derives 24H change from the oldest snapshot
 * within the 24H window once enough history exists â€” never guessed earlier.
 */
export async function syncRobinhoodPrices(
  store: SyncStore,
  registry: { address: string; symbol: string; price: number; marketCap: number | null }[],
): Promise<number> {
  if (registry.length === 0) return 0;
  const d = store.get();
  const now = Date.now();
  let updated = 0;
  for (const row of registry) {
    const address = row.address;
    const prev = d.prices[address];
    const history = (d.priceHistory[address] ??= []);
    history.push({ t: now, price: row.price });
    d.priceHistory[address] = history.filter((p) => now - p.t < 7 * 86_400_000).slice(-3_000);

    const dayAgo = now - 86_400_000;
    const base = [...d.priceHistory[address]].reverse().find((p) => p.t <= dayAgo) ?? null;
    const change24hPct =
      base && base.price > 0 ? ((row.price - base.price) / base.price) * 100 : (prev?.change24hPct ?? null);
    const change24hValue =
      change24hPct != null && base ? row.price - base.price : (prev?.change24hValue ?? null);

    d.prices[address] = {
      address,
      symbol: row.symbol,
      price: row.price,
      bid: prev?.bid ?? null,
      ask: prev?.ask ?? null,
      halted: prev?.halted ?? null,
      marketCap: row.marketCap,
      change24hPct,
      change24hValue,
      open: prev?.open ?? null,
      high: prev?.high ?? null,
      low: prev?.low ?? null,
      previousClose: base ? base.price : (prev?.previousClose ?? null),
      volume1h: prev?.volume1h ?? null,
      volume24h: prev?.volume24h ?? null,
      volume7d: prev?.volume7d ?? null,
      buyVolume24h: prev?.buyVolume24h ?? null,
      sellVolume24h: prev?.sellVolume24h ?? null,
      avgTradeSize: prev?.avgTradeSize ?? null,
      updatedAt: now,
      source: "Robinhood Chain explorer",
    };
    updated += 1;
  }
  store.save();
  return updated;
}

/** Holder intelligence from the explorer: totals + top-100 with verified shares. */
export async function syncHoldersFromExplorer(
  store: SyncStore,
  blockscout: BlockscoutProvider,
  maxPerCycle: number,
): Promise<number> {
  const d = store.get();
  const markets = Object.values(d.markets).filter((m) => m.verified === true);
  if (markets.length === 0) return 0;
  let updated = 0;
  const rotated = markets
    .slice()
    .sort(
      (a, b) =>
        (d.prices[b.address]?.marketCap ?? d.prices[b.address]?.price ?? 0) -
        (d.prices[a.address]?.marketCap ?? d.prices[a.address]?.price ?? 0),
    );
  for (const market of rotated.slice(0, maxPerCycle)) {
    const detail = await blockscout.tokenDetail(market.address);
    if (detail && detail.holders != null) {
      const price = d.prices[market.address]?.price ?? null;
      const prev = d.prices[market.address];
      if (prev && detail.volume24h != null) {
        d.prices[market.address] = { ...prev, volume24h: detail.volume24h };
      }
      if (price != null) {
        const history = (d.holderHistory[market.address] ??= []);
        history.push({ t: Date.now(), holders: detail.holders });
        d.holderHistory[market.address] = history.slice(-720);
      }
    }
    const list = await blockscout.holders(market.address);
    if (!list || list.length === 0) continue;
    const supply = normalizeSupply(
      detail?.totalSupplyRaw ?? market.totalSupply,
      market.decimals ?? detail?.decimals ?? null,
    );
    const price = d.prices[market.address]?.price ?? null;
    const top = list.map((h) => {
      let amount: number | null = null;
      try {
        amount = Number(BigInt(h.valueRaw)) / 10 ** (market.decimals ?? 18);
      } catch {
        amount = null;
      }
      const sharePct = supply != null && supply > 0 && amount != null ? (amount / supply) * 100 : null;
      return {
        address: h.address,
        sharePct,
        balance: amount,
        usd: amount != null && price != null ? amount * price : null,
      };
    });
    d.holders[market.address] = {
      address: market.address,
      symbol: market.symbol ?? "",
      total: detail?.holders ?? null,
      new24h: null,
      lost24h: null,
      growthPct: null,
      concentration:
        supply != null && supply > 0
          ? top.reduce((acc, h) => acc + (h.sharePct ?? 0), 0)
          : null,
      top,
      updatedAt: Date.now(),
    };
    updated += 1;
  }
  if (updated > 0) store.save();
  return updated;
}

/**
 * Official RHJ asset registry -> verified markets + corporate-action
 * multiplier capture. Produces data only when the API is reachable.
 */
export async function syncRhjAssets(
  store: SyncStore,
  robinhood: RobinhoodStockTokenProvider,
): Promise<number> {
  const assets = await robinhood.assets();
  if (!assets) return 0;
  const d = store.get();
  const fresh: string[] = [];
  for (const a of assets) {
    const existing = d.markets[a.address];
    if (!existing) fresh.push(a.address);
    d.markets[a.address] = {
      ...(existing ?? {}),
      address: a.address,
      symbol: a.symbol,
      name: a.name ?? existing?.name ?? a.symbol,
      underlyingSymbol: a.symbol,
      underlyingAssetType: existing?.underlyingAssetType ?? null,
      multiplier: a.multiplier,
      logoUrl: a.logoUrl ?? existing?.logoUrl ?? null,
      tradingCapabilities: a.tradingCapabilities ?? existing?.tradingCapabilities ?? null,
      status: (a.status as SyncMarket["status"] | undefined) ?? existing?.status ?? "active",
      source: "indexer",
      chainId: SYNC_CONFIG.chainId,
      firstSeen: existing?.firstSeen ?? Date.now(),
      assetType: existing?.assetType ?? "unknown",
    };
  }
  recordDiscovery(store, fresh);
  store.save();
  return assets.length;
}

/**
 * Official RHJ prices -> normalized token price (underlying mid x
 * corporate-action multiplier) plus bid/ask, daily volume and daily
 * high/low. The quote's deployment contract address is validated against
 * the registry before writing. Markets rotate so every registered asset
 * is covered, not only the first N. Nothing is written when the API
 * returns malformed, missing or non-finite values.
 */
export async function syncRhjPrices(
  store: SyncStore,
  robinhood: RobinhoodStockTokenProvider,
): Promise<number> {
  const d = store.get();
  const markets = Object.values(d.markets).filter((m) => m.symbol);
  if (markets.length === 0) return 0;
  const now = Date.now();
  let updated = 0;
  let fetched = 0;
  let sample = "";
  // Rotate the pricing window so all markets get covered across cycles.
  const perCycle = 12;
  const start = (rhjCycle++ * perCycle) % markets.length;
  const window = [...markets.slice(start), ...markets.slice(0, start)];
  for (const market of window.slice(0, perCycle)) {
    const symbol = market.symbol as string;
    const rhj = await robinhood.price(symbol);
    if (!rhj) continue;
    fetched += 1;
    // Prefer the chain-validated deployment address from the quote itself;
    // only write when it maps to a known registry market.
    const target =
      (rhj.address && d.markets[rhj.address]) ||
      markets.find((m) => m.symbol === (rhj.symbol ?? symbol)) ||
      market;
    const address = target.address;
    if (!address || !d.markets[address]) continue;
    const prev = d.prices[address];
    const multiplier = target.multiplier ?? 1;
    const tokenPrice = rhj.mid != null && Number.isFinite(rhj.mid) ? rhj.mid * multiplier : (prev?.price ?? null);
    if (tokenPrice == null) continue;
    const history = (d.priceHistory[address] ??= []);
    if (history.length === 0 || now - history[history.length - 1].t > 30_000) {
      history.push({ t: now, price: tokenPrice });
      d.priceHistory[address] = history
        .filter((p) => now - p.t < 7 * 86_400_000)
        .slice(-3_000);
    }
    const dayAgo = now - 86_400_000;
    const base = [...d.priceHistory[address]].reverse().find((p) => p.t <= dayAgo) ?? null;
    const change24hPct =
      base && base.price > 0 ? ((tokenPrice - base.price) / base.price) * 100 : (prev?.change24hPct ?? null);
    d.prices[address] = {
      address,
      symbol: target.symbol ?? "",
      price: tokenPrice,
      bid: rhj.bid != null ? rhj.bid * multiplier : null,
      ask: rhj.ask != null ? rhj.ask * multiplier : null,
      halted: rhj.halted,
      marketCap: prev?.marketCap ?? null,
      change24hPct,
      change24hValue: change24hPct != null && base ? tokenPrice - base.price : (prev?.change24hValue ?? null),
      open: prev?.open ?? null,
      high: rhj.high24h != null ? rhj.high24h * multiplier : (prev?.high ?? null),
      low: rhj.low24h != null ? rhj.low24h * multiplier : (prev?.low ?? null),
      previousClose: base ? base.price : (prev?.previousClose ?? null),
      volume1h: prev?.volume1h ?? null,
      volume24h: rhj.volume24h ?? prev?.volume24h ?? null,
      volume7d: prev?.volume7d ?? null,
      buyVolume24h: prev?.buyVolume24h ?? null,
      sellVolume24h: prev?.sellVolume24h ?? null,
      avgTradeSize: prev?.avgTradeSize ?? null,
      updatedAt: now,
      source: "Robinhood Stock Token API",
    };
    if (!sample) sample = `${target.symbol ?? symbol} mid=${tokenPrice.toFixed(3)}`;
    updated += 1;
  }
  if (updated > 0) store.save();
  // Diagnostics (throttled to once per minute; never logs secrets).
  if (now - rhjLastLogAt > 60_000) {
    rhjLastLogAt = now;
    if (updated > 0) {
      console.log(`[recode] rhj-prices: fetched ${fetched} quotes, wrote ${updated} prices (e.g. ${sample})`);
    } else {
      console.log(
        `[recode] rhj-prices: no quotes written this cycle (${robinhood.state.lastError ?? "no usable data"})`,
      );
    }
  }
  return updated;
}
