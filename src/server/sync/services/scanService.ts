import { getOnchainProvider } from "./onchainWalletService";
import { analyzeContract, type ContractIntel } from "./contractService";
import { getSyncStore } from "../store";
import { SYNC_CONFIG } from "../config";
import { getMarketSyncEngine } from "../MarketSyncEngine";
import {
  BlockscoutTokenIntelligence,
  createPrimaryIntelProvider,
  resolveHolders,
} from "../intelligence/tokenIntelligence";
import { holderConcentration, whaleExposure, whaleFlows, isBurnAddress } from "../intelligence/whale";
import { normalizeSupplyRaw } from "../intelligence/supply";
import {
  aggregateActivity,
  contractAge,
  detectCapabilities,
  resolveScanMarket,
  scanValuation,
  type ActivityTx,
} from "../intelligence/scanIntel";

/**
 * ============================================================
 * RECODE Scan — server-side aggregation service
 * ============================================================
 * One normalized response per address. All RPC/indexer/explorer
 * calls happen here (never from the browser), in parallel where
 * safe, with two TTL caches:
 *   • contract metadata / capabilities — 60s (slow-changing)
 *   • full scan response (price, network, activity) — 15s
 * Every section carries source + freshness. Unavailable → null.
 */

const SCAN_TTL_MS = 15_000;
const META_TTL_MS = 60_000;

interface CacheEntry<T> {
  expires: number;
  data: T;
}
const scanCache = new Map<string, CacheEntry<ScanResult>>();
const metaCache = new Map<string, CacheEntry<CachedMeta>>();

interface CachedMeta {
  contract: ContractIntel;
  bytecode: string | null;
  capabilities: ReturnType<typeof detectCapabilities>;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return null;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
  cache.set(key, { expires: Date.now() + ttl, data });
  if (cache.size > 200) {
    for (const [k, v] of cache) {
      if (v.expires <= Date.now()) cache.delete(k);
    }
  }
}

export interface ScanResult {
  address: string;
  contract: {
    onChainState: string | null;
    contractType: string | null;
    tokenStandard: string | null;
    codeSizeBytes: number | null;
    isVerified: boolean | null;
    compiler: string | null;
    creator: string | null;
    deploymentTx: string | null;
    deployedAt: number | null;
    ageDays: number | null;
    ageLabel: string | null;
    isProxy: boolean | null;
    implementation: string | null;
    adminAddress: string | null;
    owner: string | null;
  };
  token: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: number | null;
    totalSupplyRaw: string | null;
    known: boolean;
    knownSymbol: string | null;
    logoUrl: string | null;
  };
  market: ReturnType<typeof resolveScanMarket> | null;
  marketUnavailableReason: string | null;
  valuation: {
    marketCap: number | null;
    marketCapSource: string | null;
    marketCapVerified: boolean | null;
    fdv: number | null;
    fdvBasis: string | null;
  };
  liquidity: {
    totalUsd: number | null;
    pools: { address: string; dex: string | null; liquidityUsd: number | null }[] | null;
    updatedAt: number | null;
    configured: boolean;
    reason: string | null;
  };
  holders: {
    total: number | null;
    concentration: { top10: number | null; top25: number | null; top50: number | null } | null;
    largest: { address: string | null; balance: number | null; sharePct: number | null; usd: number | null } | null;
    topHolderPct: number | null;
    /** Provable burned supply share (sum of known burn-address shares). */
    burnedPct: number | null;
    /** Null unless a DEX registry identifies pool addresses — never estimated. */
    poolHeldPct: number | null;
    source: string | null;
    provider: string | null;
    freshness: string | null;
    updatedAt: number | null;
    reason: string | null;
  };
  whales: {
    exposureUsd: number | null;
    whaleCount: number | null;
    top10Usd: number | null;
    top25Usd: number | null;
    thresholdUsd: number;
    inflowUsd: number | null;
    outflowUsd: number | null;
    netFlowUsd: number | null;
    basis: string | null;
  };
  activity: ReturnType<typeof aggregateActivity> & {
    recentTransferEvents: { count: number; fromBlock: number; toBlock: number } | null;
  };
  network: {
    online: boolean;
    chainId: number;
    blockNumber: number | null;
    blockTimestamp: number | null;
    gasPriceGwei: number | null;
  };
  security: {
    risk: string;
    riskFactors: string[];
    capabilities: ReturnType<typeof detectCapabilities>;
  };
  sources: string[];
  updatedAt: number;
}

export async function scanAddress(address: string): Promise<ScanResult> {
  const addr = address.toLowerCase();
  const cached = getCached(scanCache, addr);
  if (cached) return cached;

  getMarketSyncEngine().ensureStarted();
  const onchain = getOnchainProvider();
  const now = Date.now();

  /* Contract metadata + bytecode (60s cache — slow-changing on-chain facts). */
  let meta = getCached(metaCache, addr);
  if (!meta) {
    const contract = await analyzeContract(addr);
    const bytecode = await onchain.bytecode(addr);
    meta = { contract, bytecode, capabilities: detectCapabilities(bytecode) };
    setCached(metaCache, addr, meta, META_TTL_MS);
  }
  const { contract: intel, capabilities } = meta;

  /* Live network status (parallel, cheap RPC reads). */
  const [blockNumber, gasPriceWei] = await Promise.all([
    onchain.blockNumber(),
    onchain.gasPriceWei(),
  ]);
  const block = blockNumber != null ? await onchain.blockByNumber(blockNumber) : null;

  /* Store-derived context (prices, known registry, transfers, liquidity). */
  const store = getSyncStore().get();
  const knownEntry = store.markets[addr] ?? null;
  const priceRow = store.prices[addr] ?? null;
  const onChainTotalSupply =
    intel.totalSupplyRaw != null
      ? normalizeSupplyRaw(intel.totalSupplyRaw, intel.decimals)
      : null;
  const price = priceRow?.price ?? null;

  /* Verified market (RHJ quote via the engine store). */
  const market = resolveScanMarket({
    known: knownEntry
      ? {
          symbol: knownEntry.symbol,
          verified: knownEntry.verified,
          tradingCapabilities: knownEntry.tradingCapabilities ?? null,
          multiplier: knownEntry.multiplier,
        }
      : null,
    price: priceRow,
    now,
    freshnessMs: SYNC_CONFIG.priceFreshnessMs,
  });
  const marketUnavailableReason = market
    ? null
    : "Not an indexed priced market — RECODE reports market data only from verified live sources";

  /* Market cap / FDV with strict provenance. */
  const valuation = scanValuation({
    price,
    verifiedCirculating: null, // circulating supply is never inferred from total
    registryMarketCap: priceRow?.marketCap ?? null,
    onChainTotalSupply,
  });

  /* Holders — Goldsky subgraph / REST indexer primary → cache → blockscout fallback → stale. */
  const primary = createPrimaryIntelProvider(SYNC_CONFIG.goldskySubgraphUrl, getMarketSyncEngine().indexer);
  const fallback = new BlockscoutTokenIntelligence(
    getMarketSyncEngine().blockscout,
    (a) => store.markets[a]?.decimals ?? intel.decimals ?? null,
  );
  const holdersOutcome = await resolveHolders(
    primary,
    fallback,
    getSyncStore(),
    addr,
    onChainTotalSupply,
    SYNC_CONFIG.intervals.holdersMs,
  );

  let holders: ScanResult["holders"];
  if (holdersOutcome.ok) {
    const rows = holdersOutcome.data.rows;
    const top10 = holderConcentration(rows, 10);
    const top25 = holderConcentration(rows, 25);
    const top50 = holderConcentration(rows, 50);
    const largest = rows[0] ?? null;
    const largestUsd =
      largest?.balance != null && price != null && price > 0 ? largest.balance * price : null;
    holders = {
      total: holdersOutcome.data.total,
      concentration: {
        top10: top10?.value ?? null,
        top25: top25?.value ?? null,
        top50: top50?.value ?? null,
      },
      largest: largest
        ? { address: largest.address, balance: largest.balance, sharePct: largest.sharePct, usd: largestUsd }
        : null,
      topHolderPct: largest?.sharePct ?? null,
      // Provable burned share: sum of known burn-address percentages (null when unshared)
      burnedPct:
        holderConcentration(
          rows.filter((r) => isBurnAddress(r.address)),
          100,
        )?.value ?? null,
      poolHeldPct: null, // needs a DEX registry — never estimated
      source: holdersOutcome.provenance.source,
      provider: holdersOutcome.provenance.provider,
      freshness: holdersOutcome.provenance.freshness,
      updatedAt: holdersOutcome.provenance.updatedAt,
      reason: null,
    };
  } else {
    holders = {
      total: null,
      concentration: null,
      largest: null,
      topHolderPct: null,
      burnedPct: null,
      poolHeldPct: null,
      source: null,
      provider: null,
      freshness: "unavailable",
      updatedAt: null,
      reason: holdersOutcome.reason,
    };
  }

  /* Whale intelligence — computed internally from balances × verified price. */
  const thresholdUsd = SYNC_CONFIG.whaleThresholdUsd;
  let exposure: ReturnType<typeof whaleExposure> | null = null;
  let top10Usd: number | null = null;
  let top25Usd: number | null = null;
  if (holdersOutcome.ok) {
    const rows = holdersOutcome.data.rows;
    exposure = whaleExposure(rows, price, thresholdUsd);
    const anyUsd = rows.some((r) => r.balance != null && price != null && price > 0);
    const usdSum = (n: number): number | null =>
      anyUsd
        ? rows
            .slice(0, n)
            .reduce(
              (acc, r) => acc + (r.balance != null && price != null && price > 0 ? r.balance * price : 0),
              0,
            )
        : null;
    top10Usd = usdSum(10);
    top25Usd = usdSum(25);
  }
  const flows = whaleFlows(
    store.transactions
      .filter((t) => t.address === addr)
      .map((t) => ({ ts: t.ts, action: t.action, usd: t.usd })),
    now,
    86_400_000,
    thresholdUsd,
  );

  /* Transfer activity (verified store transfers + measured getLogs window). */
  const activity = aggregateActivity(
    store.transactions
      .filter((t) => t.address === addr)
      .map(
        (t): ActivityTx => ({
          ts: t.ts,
          action: t.action,
          amount: t.amount,
          usd: t.usd,
          hash: t.hash,
          wallet: t.wallet,
          counterparty: null,
        }),
      ),
    now,
  );

  /* Liquidity — only from a configured indexer/DEX provider. */
  const liq = SYNC_CONFIG.indexerUrl ? store.liquidity[addr] ?? null : null;

  const sources = [
    ...(intel.chainOnline ? ["Robinhood Chain RPC (Alchemy)"] : []),
    ...(market ? [`Market: ${market.source}`] : []),
    ...(holdersOutcome.ok ? [`Holders: ${holdersOutcome.provenance.source}`] : []),
    ...(flows ? ["Transfers: verified on-chain store"] : []),
    ...(intel.creator != null || intel.deployedAt != null ? ["Deployment: Robinhood Chain explorer"] : []),
  ];

  const result: ScanResult = {
    address: addr,
    contract: {
      onChainState:
        intel.exists == null
          ? null
          : intel.exists
            ? intel.isContract
              ? "Contract (code present)"
              : "Wallet (EOA)"
            : "Not found",
      contractType: intel.contractType,
      tokenStandard: intel.tokenStandard,
      codeSizeBytes: intel.codeSizeBytes,
      isVerified: intel.isVerified,
      compiler: intel.compiler,
      creator: intel.creator,
      deploymentTx: intel.deploymentTx,
      deployedAt: intel.deployedAt,
      ageDays: contractAge(intel.deployedAt, now)?.days ?? null,
      ageLabel: contractAge(intel.deployedAt, now)?.label ?? null,
      isProxy: intel.isProxy,
      implementation: intel.implementation,
      adminAddress: intel.adminAddress,
      owner: intel.owner,
    },
    token: {
      name: intel.name,
      symbol: intel.symbol,
      decimals: intel.decimals,
      totalSupply: onChainTotalSupply,
      totalSupplyRaw: intel.totalSupplyRaw,
      known: intel.known,
      knownSymbol: intel.knownSymbol,
      logoUrl: intel.logoUrl,
    },
    market,
    marketUnavailableReason,
    valuation,
    liquidity: {
      totalUsd: liq?.total ?? null,
      pools:
        liq?.pools?.map((p) => ({ address: p.address, dex: p.dex, liquidityUsd: p.liquidityUsd })) ?? null,
      updatedAt: liq?.updatedAt ?? null,
      configured: Boolean(SYNC_CONFIG.indexerUrl),
      reason: liq ? null : "DEX indexer not configured",
    },
    holders,
    whales: {
      exposureUsd: exposure?.usd ?? null,
      whaleCount: exposure ? exposure.count : null,
      top10Usd,
      top25Usd,
      thresholdUsd,
      inflowUsd: flows?.inflowUsd ?? null,
      outflowUsd: flows?.outflowUsd ?? null,
      netFlowUsd: flows?.netUsd ?? null,
      basis:
        exposure && exposure.count > 0
          ? exposure.provenance.derivedFrom
          : "No verified holder balances × price available",
    },
    activity: {
      ...activity,
      recentTransferEvents: intel.recentTransfers,
    },
    network: {
      online: intel.chainOnline,
      chainId: SYNC_CONFIG.chainId,
      blockNumber,
      blockTimestamp: block?.timestamp ?? null,
      gasPriceGwei: gasPriceWei != null ? Number(gasPriceWei) / 1e9 : null,
    },
    security: {
      risk: intel.risk,
      riskFactors: intel.riskFactors,
      capabilities,
    },
    sources,
    updatedAt: now,
  };

  setCached(scanCache, addr, result, SCAN_TTL_MS);
  return result;
}