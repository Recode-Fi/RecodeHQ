import { getSyncStore } from "@/server/sync/store";
import { getMarketSyncEngine } from "@/server/sync/MarketSyncEngine";
import { SYNC_CONFIG } from "@/server/sync/config";
import { computeLiveOverview } from "@/server/sync/analyticsService";
import { computeIntelligence, thresholdsFromEnv } from "@/lib/intelligence";
import { spreadPct } from "@/lib/market-math";
import type { CandleTimeframe, SyncMarket, SyncPrice } from "@/server/sync/types";
import type { ToolDef } from "./types";
import { scanAddress } from "@/server/sync/services/scanService";
import { analyzeContract } from "@/server/sync/services/contractService";
import {
  fetchWalletActivity,
  fetchWalletBalances,
} from "@/server/sync/services/onchainWalletService";
import { whaleExposure, whaleFlows, holderConcentration } from "@/server/sync/intelligence/whale";

/**
 * ============================================================
 * RECODE Agent — tool layer
 * ============================================================
 * Every tool calls an EXISTING RECODE service (sync store,
 * scanner, wallet service, whale intelligence). No tool owns
 * a second data pipeline and nothing is invented here.
 *
 * Data-integrity contract for every tool result:
 *   • `null` means unavailable — never converted to 0.
 *   • Each result carries `provenance` labels (LIVE / CALCULATED /
 *     HISTORICAL / UNKNOWN / UNAVAILABLE) so the model can cite them.
 *   • BUY/SELL labels are never assigned here; the existing
 *     upstream DEX-swap classification (robinhoodService) is passed
 *     through verbatim. Ordinary transfers stay `transfer`.
 */

/* ── Helpers ─────────────────────────────────────────────── */

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function engine() {
  getMarketSyncEngine().ensureStarted();
}

function store() {
  return getSyncStore().get();
}

function isAddr(s: string): boolean {
  return ADDR_RE.test(s.trim());
}

/** Resolve a market by address or symbol (case-insensitive). */
function resolveMarket(symbolOrAddress: string): SyncMarket | null {
  const s = symbolOrAddress.trim();
  if (!s) return null;
  const d = store();
  if (isAddr(s)) return d.markets[s.toLowerCase()] ?? null;
  const sym = s.toUpperCase();
  return (
    Object.values(d.markets).find((m) => (m.symbol ?? "").toUpperCase() === sym) ?? null
  );
}

function priceOf(address: string): SyncPrice | undefined {
  return store().prices[address];
}

/** Provenance label for a store price row (fresh vs stale vs absent). */
function priceProvenance(price: SyncPrice | undefined): {
  label: "LIVE" | "HISTORICAL" | "UNAVAILABLE";
  ageSeconds: number | null;
} {
  if (!price) return { label: "UNAVAILABLE", ageSeconds: null };
  const ageSeconds = Math.round((Date.now() - price.updatedAt) / 1000);
  return {
    label: ageSeconds <= SYNC_CONFIG.priceFreshnessMs / 1000 ? "LIVE" : "HISTORICAL",
    ageSeconds,
  };
}

function round(n: number | null | undefined, dp = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

function err(message: string): { error: string; provenance: "UNAVAILABLE" } {
  return { error: message, provenance: "UNAVAILABLE" };
}

const TFS: readonly string[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

/* ── Market tools ────────────────────────────────────────── */

const getMarketData: ToolDef = {
  name: "getMarketData",
  description:
    "Current verified quote for one tokenized asset (by symbol or contract address): " +
    "price, 24h change, bid/ask, spread, volume, high/low, liquidity, holders, trading status. " +
    "Returns null fields when data is unavailable — never zeros.",
  parameters: [
    {
      name: "symbol",
      type: "string",
      description: "Asset symbol (e.g. NVDA) or contract address (0x…).",
      required: true,
    },
  ],
  async execute({ symbol }) {
    engine();
    const s = String(symbol ?? "");
    const market = resolveMarket(s);
    if (!market) return err(`No indexed market for "${s}". It may not be a RECODE-indexed asset.`);
    const price = priceOf(market.address);
    const liquidity = store().liquidity[market.address] ?? null;
    const holders = store().holders[market.address] ?? null;
    const prov = priceProvenance(price);
    return {
      provenance: prov.label,
      quoteAgeSeconds: prov.ageSeconds,
      address: market.address,
      symbol: market.symbol,
      name: market.name,
      assetType: market.assetType,
      chainId: market.chainId,
      price: price?.price ?? null,
      change24hPct: round(price?.change24hPct ?? null),
      change24hValue: round(price?.change24hValue ?? null),
      open24h: price?.open ?? null,
      high24h: price?.high ?? null,
      low24h: price?.low ?? null,
      previousClose: price?.previousClose ?? null,
      bid: price?.bid ?? null,
      ask: price?.ask ?? null,
      spreadPct: spreadPct(price?.bid ?? null, price?.ask ?? null),
      volume1h: round(price?.volume1h ?? null),
      volume24h: round(price?.volume24h ?? null),
      volume7d: round(price?.volume7d ?? null),
      buyVolume24h: round(price?.buyVolume24h ?? null),
      sellVolume24h: round(price?.sellVolume24h ?? null),
      marketCap: price?.marketCap ?? null,
      halted: price?.halted ?? null,
      liquidityUsd: liquidity?.total ?? null,
      liquidityUpdatedAt: liquidity?.updatedAt ?? null,
      holders: holders?.total ?? null,
      holdersUpdatedAt: holders?.updatedAt ?? null,
      priceSource: price?.source ?? null,
    };
  },
};

const getHistoricalMarketData: ToolDef = {
  name: "getHistoricalMarketData",
  description:
    "Verified OHLCV candle history for one asset (price-feed verified or aggregated from " +
    "observed on-chain ticks). Returns actual stored candles only — never synthesized.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
    { name: "timeframe", type: "string", description: "Candle timeframe.", enum: [...TFS] },
    { name: "limit", type: "number", description: "Max candles returned (1-300)." },
  ],
  async execute({ symbol, timeframe, limit }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const tf = (TFS.includes(String(timeframe)) ? String(timeframe) : "1d") as CandleTimeframe;
    const entry = store().candles[`${market.address}:${tf}`];
    let candles = entry?.candles ?? [];
    let source = entry?.source ?? "engine";
    if (candles.length === 0) {
      // Verified tick aggregation fallback (same path the app's chart uses).
      const { aggregateCandles } = await import("@/server/sync/services/candleAggregator");
      candles = aggregateCandles(getSyncStore(), market.address, tf);
      source = "observed-ticks";
    }
    const n = Math.max(1, Math.min(300, Math.floor(Number(limit) || candles.length || 1)));
    const sliced = candles.slice(-n);
    return {
      provenance: sliced.length ? "HISTORICAL" : "UNAVAILABLE",
      symbol: market.symbol,
      address: market.address,
      timeframe: tf,
      source,
      count: sliced.length,
      candles: sliced.map((c) => ({
        t: c.t,
        o: round(c.o, 6),
        h: round(c.h, 6),
        l: round(c.l, 6),
        c: round(c.c, 6),
        v: c.v,
      })),
    };
  },
};

const getAssetIntelligence: ToolDef = {
  name: "getAssetIntelligence",
  description:
    "RECODE's deterministic Asset Intelligence scores for one asset: momentum, volume activity, " +
    "liquidity, volatility, trend — each with its exact calculation basis and a data-confidence level. " +
    "Scores are rule-based, server-computed, never AI-generated.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
  ],
  async execute({ symbol }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const d = store();
    const price = d.prices[market.address];
    const pick = (tf: CandleTimeframe) => {
      const e = d.candles[`${market.address}:${tf}`];
      return e && e.candles.length > 0
        ? { tf, candles: e.candles, source: e.source ?? "engine" }
        : null;
    };
    const series = pick("1h") ?? pick("4h") ?? pick("1d");
    const result = computeIntelligence(
      {
        candles: series?.candles ?? null,
        candleTimeframe: series?.tf,
        price: price?.price ?? null,
        volume24h: price?.volume24h ?? null,
        spreadPct: spreadPct(price?.bid ?? null, price?.ask ?? null),
        change24hPct: price?.change24hPct ?? null,
      },
      thresholdsFromEnv(),
    );
    return {
      provenance: "CALCULATED",
      symbol: market.symbol,
      address: market.address,
      ...result,
      inputs: {
        candleTimeframe: series?.tf ?? null,
        candleSource: series?.source ?? null,
        candleCount: series?.candles.length ?? 0,
        volume24h: price?.volume24h ?? null,
        spreadPct: spreadPct(price?.bid ?? null, price?.ask ?? null),
        change24hPct: price?.change24hPct ?? null,
      },
    };
  },
};

/* ── Liquidity / metadata / status tools ─────────────────── */

const getTokenLiquidity: ToolDef = {
  name: "getTokenLiquidity",
  description:
    "Verified liquidity for one asset: total USD liquidity, DEX pools, 24h change. " +
    "Null when the liquidity provider is not configured — never an estimate.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
  ],
  async execute({ symbol }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const liq = store().liquidity[market.address] ?? null;
    if (!liq) {
      return {
        provenance: "UNAVAILABLE",
        address: market.address,
        symbol: market.symbol,
        totalUsd: null,
        pools: null,
        reason: SYNC_CONFIG.indexerUrl
          ? "No verified liquidity data indexed yet for this token"
          : "Liquidity provider not configured",
      };
    }
    return {
      provenance: "LIVE",
      address: market.address,
      symbol: market.symbol,
      totalUsd: liq.total,
      buy: liq.buy,
      sell: liq.sell,
      change24h: liq.change24h,
      providers: liq.providers,
      pools: liq.pools,
      updatedAt: liq.updatedAt,
    };
  },
};

const getTokenMetadata: ToolDef = {
  name: "getTokenMetadata",
  description:
    "Verified on-chain token metadata: name, symbol, decimals, total supply, token standard, " +
    "underlying security mapping, verification badge. Read directly from the chain / registry.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
  ],
  async execute({ symbol }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const underlying = store().underlyingMeta[market.address] ?? null;
    return {
      provenance: "LIVE",
      address: market.address,
      symbol: market.symbol,
      name: market.name,
      decimals: market.decimals,
      totalSupplyRaw: market.totalSupply,
      circulatingSupplyRaw: market.circulatingSupply,
      tokenStandard: market.tokenStandard,
      assetType: market.assetType,
      underlying: market.underlying,
      underlyingSymbol: market.underlyingSymbol,
      underlyingAssetType: market.underlyingAssetType,
      underlyingSector: underlying?.sector ?? null,
      underlyingIndustry: underlying?.industry ?? null,
      verified: market.verified,
      multiplier: market.multiplier,
      status: market.status,
      firstSeen: market.firstSeen,
      source: market.source,
      chainId: market.chainId,
    };
  },
};

const getNetworkStatus: ToolDef = {
  name: "getNetworkStatus",
  description:
    "Health of the RECODE data plane: sync engine mode, chain id, provider states " +
    "(rpc/indexer/price-feed/blockscout), indexed market counts. " +
    "Use it to explain WHY data may be unavailable.",
  parameters: [],
  async execute() {
    engine();
    const status = getMarketSyncEngine().getStatus();
    const overview = computeLiveOverview(getSyncStore());
    return {
      provenance: "LIVE",
      engineMode: status.mode,
      chainId: status.chainId,
      providers: Object.fromEntries(
        Object.entries(status.providers).map(([k, v]) => [
          k,
          { configured: v.configured, ok: v.ok, lastSuccess: v.lastSuccess, lastError: v.lastError },
        ]),
      ),
      marketsIndexed: overview.marketsIndexed,
      marketsWithPrice: overview.marketsWithPrice,
      totalVolume24h: overview.totalVolume24h,
      totalLiquidity: overview.totalLiquidity,
      liquidityConfigured: overview.liquidityConfigured,
      updatedAt: status.updatedAt,
    };
  },
};

const getMarketOverview: ToolDef = {
  name: "getMarketOverview",
  description:
    "Cross-market snapshot of every indexed RECODE asset: price, 24h change, volume, " +
    "liquidity, holders per token. Use it for \"what's moving right now\" style questions.",
  parameters: [
    {
      name: "sortBy",
      type: "string",
      description: "Sort key.",
      enum: ["change", "volume", "liquidity", "marketCap"],
    },
    { name: "limit", type: "number", description: "Max rows (default 20, max 50)." },
  ],
  async execute({ sortBy, limit }) {
    engine();
    const d = store();
    const key = ["change", "volume", "liquidity", "marketCap"].includes(String(sortBy))
      ? (String(sortBy) as "change" | "volume" | "liquidity" | "marketCap")
      : "change";
    const pickVal = (r: Record<string, unknown>): number | null => {
      const k = key === "change" ? "change24hPct" : key;
      const v = r[k];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const rows = Object.values(d.markets)
      .map((m) => {
        const p = d.prices[m.address];
        return {
          symbol: m.symbol,
          name: m.name,
          address: m.address,
          assetType: m.assetType,
          price: p?.price ?? null,
          change24hPct: round(p?.change24hPct ?? null),
          volume24h: round(p?.volume24h ?? null),
          liquidityUsd: d.liquidity[m.address]?.total ?? null,
          holders: d.holders[m.address]?.total ?? null,
          marketCap: p?.marketCap ?? null,
          halted: p?.halted ?? null,
        };
      })
      .filter((r) => r.price != null)
      .sort((a, b) => (pickVal(b) ?? -Infinity) - (pickVal(a) ?? -Infinity));
    const n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
    return {
      provenance: rows.length ? "LIVE" : "UNAVAILABLE",
      sortBy: key,
      count: rows.length,
      markets: rows.slice(0, n),
    };
  },
};

/* ── Contract / scanner tools ────────────────────────────── */

const scanContract: ToolDef = {
  name: "scanContract",
  description:
    "Full RECODE contract scan for an address: contract type, verification, proxy status, " +
    "capabilities, token metadata, holders, liquidity, valuation, activity. Every section " +
    "carries its source and freshness; unavailable metrics are null.",
  parameters: [
    { name: "address", type: "string", description: "Contract address (0x…).", required: true },
  ],
  async execute({ address }) {
    const a = String(address ?? "").trim().toLowerCase();
    if (!isAddr(a)) return err("Invalid contract address — expected a 42-char 0x address.");
    try {
      const scan = await scanAddress(a);
      return {
        provenance: scan.network?.online ? "LIVE" : "UNAVAILABLE",
        address: a,
        contract: scan.contract,
        token: scan.token,
        market: scan.market ?? null,
        marketUnavailableReason: scan.marketUnavailableReason ?? null,
        valuation: scan.valuation,
        liquidity: scan.liquidity,
        holders: scan.holders,
        activity: scan.activity ?? null,
        network: scan.network,
      };
    } catch (e) {
      return err(e instanceof Error ? e.message : "Scan failed");
    }
  },
};

const getContractVerification: ToolDef = {
  name: "getContractVerification",
  description:
    "Verification + security posture of a contract: source verification status, proxy/implementation, " +
    "admin/owner where PROVEN on-chain, detected capabilities. Unproven facts are null.",
  parameters: [
    { name: "address", type: "string", description: "Contract address (0x…).", required: true },
  ],
  async execute({ address }) {
    const a = String(address ?? "").trim().toLowerCase();
    if (!isAddr(a)) return err("Invalid contract address.");
    try {
      const intel = await analyzeContract(a);
      return {
        provenance: "LIVE",
        address: a,
        contractType: intel.contractType ?? null,
        tokenStandard: intel.tokenStandard ?? null,
        isVerified: intel.isVerified ?? null,
        compiler: intel.compiler ?? null,
        isProxy: intel.isProxy ?? null,
        implementation: intel.implementation ?? null,
        adminAddress: intel.adminAddress ?? null,
        owner: intel.owner ?? null,
        codeSizeBytes: intel.codeSizeBytes ?? null,
      };
    } catch (e) {
      return err(e instanceof Error ? e.message : "Verification failed");
    }
  },
};

const getDeploymentInfo: ToolDef = {
  name: "getDeploymentInfo",
  description:
    "Deployment facts for a contract: creator address, deployment transaction, deployed-at " +
    "timestamp and age. Null when the explorer has no record — never guessed.",
  parameters: [
    { name: "address", type: "string", description: "Contract address (0x…).", required: true },
  ],
  async execute({ address }) {
    const a = String(address ?? "").trim().toLowerCase();
    if (!isAddr(a)) return err("Invalid contract address.");
    try {
      const intel = await analyzeContract(a);
      const ageDays =
        intel.deployedAt != null
          ? Math.max(0, Math.floor((Date.now() - intel.deployedAt) / 86_400_000))
          : null;
      return {
        provenance: intel.deployedAt != null ? "HISTORICAL" : "UNKNOWN",
        address: a,
        creator: intel.creator ?? null,
        deploymentTx: intel.deploymentTx ?? null,
        deployedAt: intel.deployedAt ?? null,
        ageDays,
      };
    } catch (e) {
      return err(e instanceof Error ? e.message : "Deployment lookup failed");
    }
  },
};

/* ── Holders tools ───────────────────────────────────────── */

const getTokenHolders: ToolDef = {
  name: "getTokenHolders",
  description:
    "Verified holder analytics for one token: total holders, 24h growth, concentration, " +
    "and top holder entries. From the token-intelligence providers (indexer → blockscout); " +
    "null with a reason when no verified holder data exists.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
  ],
  async execute({ symbol }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const h = store().holders[market.address] ?? null;
    if (!h) {
      return {
        provenance: "UNAVAILABLE",
        address: market.address,
        symbol: market.symbol,
        total: null,
        top: null,
        reason: SYNC_CONFIG.indexerUrl
          ? "No verified holder data indexed yet for this token"
          : "Holder intelligence provider not configured",
      };
    }
    return {
      provenance: h.intel?.verified ? "LIVE" : "UNKNOWN",
      address: market.address,
      symbol: market.symbol,
      total: h.total,
      new24h: h.new24h,
      lost24h: h.lost24h,
      growthPct: h.growthPct,
      concentration: h.concentration,
      top: h.top.slice(0, 15),
      source: h.intel?.source ?? null,
      provider: h.intel?.provider ?? null,
      confidence: h.intel?.confidence ?? null,
      freshness: h.intel?.freshness ?? null,
      updatedAt: h.updatedAt,
    };
  },
};

const getTopHolders: ToolDef = {
  name: "getTopHolders",
  description:
    "Top-N verified holders of one token with balances, share of supply and computed USD " +
    "value (balance × verified price; USD null when price is unavailable).",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address.", required: true },
    { name: "limit", type: "number", description: "How many holders (default 10, max 25)." },
  ],
  async execute({ symbol, limit }) {
    engine();
    const market = resolveMarket(String(symbol ?? ""));
    if (!market) return err(`No indexed market for "${symbol}".`);
    const d = store();
    const h = d.holders[market.address] ?? null;
    const price = d.prices[market.address]?.price ?? null;
    if (!h || h.top.length === 0) {
      return {
        provenance: "UNAVAILABLE",
        address: market.address,
        symbol: market.symbol,
        holders: null,
      };
    }
    const n = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));
    const exposure = whaleExposure(h.top, price, SYNC_CONFIG.whaleThresholdUsd);
    return {
      provenance: h.intel?.verified ? "LIVE" : "UNKNOWN",
      address: market.address,
      symbol: market.symbol,
      priceUsed: price,
      usdBasis: price != null ? "calculated: balance × verified price" : null,
      holders: h.top.slice(0, n).map((t) => ({
        address: t.address,
        balance: t.balance,
        sharePct: t.sharePct,
        usd: t.usd,
      })),
      whaleUsdExposure: exposure.usd,
      whaleCount: exposure.count,
      top10Concentration: holderConcentration(h.top, 10)?.value ?? null,
      top25Concentration: holderConcentration(h.top, 25)?.value ?? null,
    };
  },
};

/* ── Whale tools ─────────────────────────────────────────── */

const getWhaleActivity: ToolDef = {
  name: "getWhaleActivity",
  description:
    "Verified whale activity for one token over a time window: whale-size transfers, " +
    "inflow/outflow/net USD flow, plus the raw classified events. " +
    "IMPORTANT: BUY/SELL labels come from actual DEX-swap evidence only; ordinary transfers " +
    "are labeled TRANSFER. Unverified USD values are null and excluded from flow sums.",
  parameters: [
    { name: "symbol", type: "string", description: "Asset symbol or contract address." },
    { name: "windowHours", type: "number", description: "Look-back window in hours (default 24, max 168)." },
    { name: "minUsd", type: "number", description: "Minimum USD size filter (default: RECODE whale threshold)." },
    {
      name: "kind",
      type: "string",
      description: "Filter by classification.",
      enum: ["all", "buy", "sell", "transfer"],
    },
  ],
  async execute({ symbol, windowHours, minUsd, kind }) {
    engine();
    const d = store();
    const market = symbol ? resolveMarket(String(symbol)) : null;
    const addr =
      market?.address ??
      (symbol && isAddr(String(symbol)) ? String(symbol).toLowerCase() : null);
    if (symbol && !addr) return err(`No indexed market for "${symbol}".`);

    const hours = Math.max(1, Math.min(168, Number(windowHours) || 24));
    const threshold = Number(minUsd) > 0 ? Number(minUsd) : SYNC_CONFIG.whaleThresholdUsd;
    const now = Date.now();
    const since = now - hours * 3_600_000;

    const txs = d.transactions.filter(
      (t) => t.ts >= since && (addr ? t.address === addr : true),
    );
    const whales = d.whales.filter(
      (w) => w.ts >= since && (addr ? w.address === addr : true),
    );
    const kindFilter = String(kind ?? "all");
    const filtered = kindFilter !== "all" ? txs.filter((t) => t.action === kindFilter) : txs;

    const price = addr ? d.prices[addr]?.price ?? null : null;

    const flows =
      addr && txs.length
        ? whaleFlows(
            txs.map((t) => ({ ts: t.ts, action: t.action, usd: t.usd })),
            now,
            hours * 3_600_000,
            threshold,
          )
        : null;

    return {
      provenance: filtered.length || whales.length ? "LIVE" : "UNAVAILABLE",
      symbol: market?.symbol ?? null,
      address: addr,
      windowHours: hours,
      thresholdUsd: threshold,
      classificationBasis:
        "upstream DEX-swap evidence (token flow to/from a DEX pool); ordinary transfers are TRANSFER",
      flow: flows
        ? {
            inflowUsd: flows.inflowUsd,
            outflowUsd: flows.outflowUsd,
            netUsd: flows.netUsd,
            basis: flows.basis,
          }
        : {
            inflowUsd: null,
            outflowUsd: null,
            netUsd: null,
            basis: "No whale-size transfers with verified USD in this window",
          },
      buyCount: txs.filter((t) => t.action === "buy").length,
      sellCount: txs.filter((t) => t.action === "sell").length,
      transferCount: txs.filter((t) => t.action === "transfer").length,
      events: filtered.slice(0, 30).map((t) => ({
        ts: t.ts,
        wallet: t.wallet,
        action: t.action,
        amount: t.amount,
        usd: t.usd,
        hash: t.hash,
        symbol: t.symbol,
      })),
      whaleEvents: whales.slice(0, 30).map((w) => ({
        ts: w.ts,
        wallet: w.wallet,
        kind: w.kind,
        usd: w.usd,
        symbol: w.symbol,
      })),
      priceUsed: price,
      note:
        txs.length === 0
          ? `Data unavailable: no verified transfers indexed in the last ${hours}h` +
            (addr ? " for this token" : "")
          : null,
    };
  },
};

const getRecentTransfers: ToolDef = {
  name: "getRecentTransfers",
  description:
    "Recent verified on-chain transfers from the RECODE indexer, optionally filtered by " +
    "token or wallet. Action labels pass through upstream DEX-swap classification untouched.",
  parameters: [
    { name: "symbol", type: "string", description: "Optional token filter (symbol or address)." },
    { name: "wallet", type: "string", description: "Optional wallet address filter (0x…)." },
    { name: "limit", type: "number", description: "Max rows (default 20, max 60)." },
  ],
  async execute({ symbol, wallet, limit }) {
    engine();
    const d = store();
    let rows = d.transactions;
    if (symbol) {
      const market = resolveMarket(String(symbol));
      const addr =
        market?.address ?? (isAddr(String(symbol)) ? String(symbol).toLowerCase() : null);
      if (!addr) return err(`No indexed market for "${symbol}".`);
      rows = rows.filter((t) => t.address === addr);
    }
    if (wallet) {
      const w = String(wallet).trim().toLowerCase();
      if (!isAddr(w)) return err("Invalid wallet address.");
      rows = rows.filter((t) => t.wallet?.toLowerCase() === w);
    }
    const n = Math.max(1, Math.min(60, Math.floor(Number(limit) || 20)));
    return {
      provenance: rows.length ? "LIVE" : "UNAVAILABLE",
      count: rows.length,
      transfers: rows.slice(0, n).map((t) => ({
        ts: t.ts,
        wallet: t.wallet,
        action: t.action,
        amount: t.amount,
        usd: t.usd,
        hash: t.hash,
        symbol: t.symbol,
        address: t.address,
      })),
      note: rows.length === 0 ? "Data unavailable: no verified transfers in the indexed window" : null,
    };
  },
};

/* ── Wallet tools ────────────────────────────────────────── */

const getWalletBalances: ToolDef = {
  name: "getWalletBalances",
  description:
    "Live on-chain balances for a wallet: native balance via eth_getBalance plus token balances " +
    "via balanceOf on every indexed verified contract. USD values exist only when a verified " +
    "price exists — otherwise null.",
  parameters: [
    { name: "address", type: "string", description: "Wallet address (0x…).", required: true },
  ],
  async execute({ address }) {
    engine();
    const a = String(address ?? "").trim().toLowerCase();
    if (!isAddr(a)) return err("Invalid wallet address.");
    try {
      const data = await fetchWalletBalances(a);
      return {
        provenance: data.chainOnline ? "LIVE" : "UNAVAILABLE",
        address: a,
        result: data,
      };
    } catch (e) {
      return err(e instanceof Error ? e.message : "Balance fetch failed");
    }
  },
};

const getWalletIntelligence: ToolDef = {
  name: "getWalletIntelligence",
  description:
    "Combined wallet intelligence: live balances, recent activity, behavior statistics and " +
    "the RECODE store profile (portfolio USD, activity score, last active). " +
    "All from the wallet service + sync store — never simulated.",
  parameters: [
    { name: "address", type: "string", description: "Wallet address (0x…).", required: true },
  ],
  async execute({ address }) {
    engine();
    const a = String(address ?? "").trim().toLowerCase();
    if (!isAddr(a)) return err("Invalid wallet address.");
    try {
      const [balances, activity] = await Promise.all([
        fetchWalletBalances(a),
        fetchWalletActivity(a).catch((e: unknown) => ({
          error: e instanceof Error ? e.message : "Activity fetch failed",
        })),
      ]);
      const profile = store().wallets[a] ?? null;
      return {
        provenance: balances.chainOnline ? "LIVE" : "UNAVAILABLE",
        address: a,
        balances,
        activity,
        profile,
      };
    } catch (e) {
      return err(e instanceof Error ? e.message : "Wallet intelligence failed");
    }
  },
};

import { SOLANA_AGENT_TOOLS } from "@/server/solana/agentTools";
import { ARC_AGENT_TOOLS } from "@/server/arc/agentTools";

/* ── Registry ────────────────────────────────────────────── */

export const AGENT_TOOLS: ToolDef[] = [
  getMarketData,
  getHistoricalMarketData,
  getAssetIntelligence,
  getMarketOverview,
  getNetworkStatus,
  getTokenMetadata,
  getTokenLiquidity,
  getTokenHolders,
  getTopHolders,
  getWhaleActivity,
  getRecentTransfers,
  scanContract,
  getContractVerification,
  getDeploymentInfo,
  getWalletBalances,
  getWalletIntelligence,
  ...SOLANA_AGENT_TOOLS,
  ...ARC_AGENT_TOOLS,
];

export function toolByName(name: string): ToolDef | null {
  return AGENT_TOOLS.find((t) => t.name === name) ?? null;
}

/** Clamp tool result size so a single tool can't blow the context window. */
export function clampToolResult(value: unknown, maxChars = 14_000): string {
  let json = JSON.stringify(value, null, 2);
  if (json.length > maxChars) {
    json = `${json.slice(0, maxChars)}\n…[truncated]`;
  }
  return json;
}






