import { SYNC_CONFIG } from "./config";
import { getSyncStore, type SyncStore } from "./store";
import { BlockscoutProvider } from "./providers/blockscout";
import { IndexerProvider } from "./providers/indexer";
import { PriceFeedProvider } from "./providers/priceFeed";
import { RobinhoodStockTokenProvider } from "./providers/robinhood";
import { RpcProvider } from "./providers/rpc";
import { syncDiscovery, syncMetadata } from "./services/rwaService";
import { syncRhjAssets, syncRhjPrices, syncRobinhoodPrices, syncRobinhoodRegistry } from "./services/robinhoodService";
import { syncUnderlyingMcaps } from "./services/underlyingService";
import { syncLogos } from "./services/logoService";
import { syncSectors } from "./services/sectorService";
import { YahooProvider } from "./providers/yahoo";
import { CoinGeckoProvider } from "./providers/coingecko";
import { syncRwaAggregates } from "./services/rwaAggregateService";
import { syncUniverse } from "./services/universeService";
import { syncCandles, syncPrices } from "./services/priceService";
import { syncLiquidity } from "./services/liquidityService";
import { syncTransactions } from "./services/transactionService";
import { syncWhales } from "./services/whaleService";
import { syncWallets } from "./services/walletService";
import { syncWhaleActivity } from "./whale/sync";
import { BlockscoutWhaleProvider } from "./whale/providers/blockscoutWhale";
import { GoldskyWhaleProvider } from "./whale/providers/goldskyWhale";
import { RpcLogsWhaleProvider } from "./whale/providers/rpcLogsWhale";
import { GoldskyTokenIntelligence } from "./providers/goldsky";
import type { WhaleActivityProvider } from "./whale/types";
import {
  BlockscoutTokenIntelligence,
  createPrimaryIntelProvider,
  resolveHolders,
  persistHoldersIntel,
} from "./intelligence/tokenIntelligence";
import { normalizeSupplyRaw } from "./intelligence/supply";
import { errorMessage, jitter } from "./util";
import type { CandleTimeframe, EngineStatus, EngineTaskState } from "./types";

interface Task extends EngineTaskState {
  offsetMs: number;
  timer: NodeJS.Timeout | null;
  running: boolean;
  fn: () => Promise<void>;
}

export class MarketSyncEngine {
  readonly chainId = SYNC_CONFIG.chainId;
  readonly rpc = new RpcProvider(SYNC_CONFIG.rpcUrl);
  readonly indexer = new IndexerProvider(SYNC_CONFIG.indexerUrl);
  readonly priceFeed = new PriceFeedProvider(SYNC_CONFIG.priceFeedUrl);
  readonly blockscout = new BlockscoutProvider(SYNC_CONFIG.blockscoutUrl);
  readonly robinhood = new RobinhoodStockTokenProvider(SYNC_CONFIG.robinhoodApiUrl);
  readonly yahoo = new YahooProvider(SYNC_CONFIG.yahooUrl, SYNC_CONFIG.yahooSeedUrl, SYNC_CONFIG.yahooCrumbUrl);
  readonly coingecko = new CoinGeckoProvider(SYNC_CONFIG.coingeckoUrl, SYNC_CONFIG.coingeckoApiKey);

  private running = false;
  private startedAt: number | null = null;
  private tasks: Task[] = [];
  private hotPairs = new Map<string, number>();
  private holderCursor = 0;
  private sectorCursor = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    const defs: [string, string, number, number, () => Promise<void>][] = [
      ["discovery", "Market discovery", SYNC_CONFIG.intervals.discoveryMs, 0, () => this.runDiscovery()],
      ["robinhoodRegistry", "Robinhood token registry", SYNC_CONFIG.intervals.discoveryMs, 1_000, () => this.runRobinhoodRegistry()],
      ["rhjAssets", "RHJ asset registry", SYNC_CONFIG.intervals.discoveryMs, 2_500, () => this.runRhjAssets()],
      ["rhjPrices", "RHJ bid/ask prices", SYNC_CONFIG.intervals.priceMs, 3_500, () => this.runRhjPrices()],
      ["underlyingMcaps", "Underlying market caps", 180_000, 25_000, () => this.runUnderlyingMcaps()],
      ["metadata", "Token metadata (RPC)", SYNC_CONFIG.intervals.metadataMs, 2_000, () => this.runMetadata()],
      ["prices", "Price sync", SYNC_CONFIG.intervals.priceMs, 3_000, () => this.runPrices()],
      ["candles", "Candle history (lazy)", SYNC_CONFIG.intervals.candlesMs, 5_000, () => this.runCandles()],
      ["transactions", "Transaction feed", SYNC_CONFIG.intervals.transactionsMs, 7_000, () => this.runTransactions()],
      ["whaleActivity", "Whale activity (Blockscout · Goldsky · RPC)", SYNC_CONFIG.intervals.whaleActivityMs, 9_000, () => this.runWhaleActivity()],
      ["whales", "Whale feed", SYNC_CONFIG.intervals.whalesMs, 11_000, () => this.runWhales()],
      ["liquidity", "Liquidity sync", SYNC_CONFIG.intervals.liquidityMs, 13_000, () => this.runLiquidity()],
      ["holders", "Holder sync", SYNC_CONFIG.intervals.holdersMs, 15_000, () => this.runHolders()],
      ["wallets", "Wallet intelligence", SYNC_CONFIG.intervals.walletsMs, 17_000, () => this.runWallets()],
      ["logos", "Asset logo resolution", 900_000, 6_000, () => this.runLogos()],
      ["sectors", "Underlying sector metadata", 180_000, 22_000, () => this.runSectors()],
      ["rwaAggregates", "RWA category aggregates", SYNC_CONFIG.rwaAggregatesMs, 12_000, () => this.runRwaAggregates()],
      ["cgUniverse", "RWA universe discovery", 300_000, 26_000, () => this.runCgUniverse()],
      ["prune", "Cache pruning", SYNC_CONFIG.intervals.pruneMs, 20_000, () => this.runPrune()],
    ];
    for (const [id, label, intervalMs, offsetMs, fn] of defs) {
      const task: Task = {
        id, label, intervalMs, offsetMs, fn,
        lastRun: null, lastSuccess: null, lastError: null, runs: 0, failures: 0, timer: null, running: false,
      };
      this.tasks.push(task);
      task.timer = setTimeout(() => {
        void this.loop(task);
      }, offsetMs);
    }
    console.log(
      `[recode] MarketSyncEngine started Â· chain ${this.chainId} Â· providers: rpc=${Boolean(SYNC_CONFIG.rpcUrl)} indexer=${Boolean(SYNC_CONFIG.indexerUrl)} priceFeed=${Boolean(SYNC_CONFIG.priceFeedUrl)}`,
    );
  }

  stop(): void {
    this.running = false;
    for (const task of this.tasks) {
      if (task.timer) clearTimeout(task.timer);
      task.timer = null;
    }
  }

  /** Lazily boots the engine on first API touch (safety net for instrumentation). */
  ensureStarted(): void {
    if (!this.running) this.start();
  }

  /** Marks a (market, timeframe) pair as hot so candles sync lazily. */
  markHotPair(symbolOrAddress: string, tf: CandleTimeframe): void {
    const d = getSyncStore().get();
    const q = symbolOrAddress.toLowerCase();
    const market = Object.values(d.markets).find(
      (m) => m.address === q || (m.symbol ?? "").toLowerCase() === q,
    );
    const address = market?.address ?? (/^0x[a-f0-9]{40}$/.test(q) ? q : null);
    if (!address) return;
    this.hotPairs.set(`${address}:${tf}`, Date.now());
  }

  getStatus(): EngineStatus {
    const d = getSyncStore().get();
    const providers = {
      rpc: this.rpc.state,
      indexer: this.indexer.state,
      priceFeed: this.priceFeed.state,
      blockscout: this.blockscout.state,
      robinhood: this.robinhood.state,
      coingecko: this.coingecko.state,
    };
    const anyConfigured =
      providers.rpc.configured ||
      providers.indexer.configured ||
      providers.priceFeed.configured ||
      providers.blockscout.configured ||
      providers.robinhood.configured;
    const anyOk = Object.values(providers).some((p) => p.configured && p.ok === true);
    const mode: EngineStatus["mode"] = !anyConfigured
      ? "standby"
      : anyOk
        ? Object.keys(d.prices).length > 0
          ? "live"
          : "syncing"
        : "degraded";
    return {
      running: this.running,
      startedAt: this.startedAt,
      chainId: this.chainId,
      mode,
      providers,
      coingeckoKeyConfigured: this.coingecko.keyConfigured,
      tasks: this.tasks.map((t) => ({
        id: t.id, label: t.label, intervalMs: t.intervalMs,
        lastRun: t.lastRun, lastSuccess: t.lastSuccess, lastError: t.lastError,
        runs: t.runs, failures: t.failures,
      })),
      marketsIndexed: Object.keys(d.markets).length,
      pricesSynced: Object.keys(d.prices).length,
      transactionsStored: d.transactions.length,
      whalesStored: d.whales.length,
      intelligence: {
        holdersPrimary: SYNC_CONFIG.goldskySubgraphUrl
          ? "goldsky-subgraph (RECODE_GOLDSKY_SUBGRAPH_URL)"
          : providers.indexer.configured
            ? "indexer (RECODE_INDEXER_URL)"
            : "none configured — blockscout fallback",
        holdersFallback: "blockscout (Robinhood Chain explorer)",
        indexerConfigured: providers.indexer.configured,
        fallbackConfigured: providers.blockscout.configured,
        indexerOk: providers.indexer.ok,
        fallbackOk: providers.blockscout.ok,
        indexerLastSuccess: providers.indexer.lastSuccess,
        fallbackLastSuccess: providers.blockscout.lastSuccess,
      },
      updatedAt: Date.now(),
    };
  }

  private store(): SyncStore {
    return getSyncStore();
  }

  private async loop(task: Task): Promise<void> {
    while (this.running) {
      task.running = true;
      task.lastRun = Date.now();
      task.runs += 1;
      try {
        await task.fn();
        task.lastSuccess = Date.now();
        task.lastError = null;
      } catch (err) {
        task.failures += 1;
        task.lastError = errorMessage(err);
      }
      task.running = false;
      await new Promise<void>((resolve) => {
        task.timer = setTimeout(resolve, jitter(task.intervalMs));
      });
      if (!this.running) return;
    }
  }

  private async runDiscovery(): Promise<void> {
    const priceItems = this.priceFeed.url ? await this.priceFeed.prices() : [];
    const result = await syncDiscovery(this.store(), this.indexer, priceItems, SYNC_CONFIG.marketListUrl);
    if (result.discovered > 0) {
      console.log(`[recode] discovery: ${result.discovered} new market(s) indexed`);
    }
  }

  private async runRobinhoodRegistry(): Promise<void> {
    const result = await syncRobinhoodRegistry(this.store(), this.blockscout);
    if (result.discovered > 0) {
      console.log(`[recode] robinhood registry: ${result.discovered} new market(s) Â· total ${result.total}`);
    }
  }

  private async runRhjAssets(): Promise<void> {
    await syncRhjAssets(this.store(), this.robinhood);
  }

  private async runRhjPrices(): Promise<void> {
    await syncRhjPrices(this.store(), this.robinhood);
  }

  private async runCgUniverse(): Promise<void> {
    await syncUniverse(this.store(), this.coingecko);
  }

  private underlyingCycles = 0;

  private async runUnderlyingMcaps(): Promise<void> {
    this.underlyingCycles += 1;
    await syncUnderlyingMcaps(
      this.store(),
      this.robinhood,
      this.yahoo,
      10,
      this.underlyingCycles,
    );
  }

  private async runMetadata(): Promise<void> {
    await syncMetadata(this.store(), this.rpc, SYNC_CONFIG.metadataBatch, SYNC_CONFIG.intervals.metadataMs);
  }

  private async runLogos(): Promise<void> {
    await syncLogos(this.store());
  }

  private async runSectors(): Promise<void> {
    await syncSectors(this.store(), this.yahoo, 15, this.sectorCursor++);
  }

  private async runRwaAggregates(): Promise<void> {
    await syncRwaAggregates(this.store(), this.coingecko);
  }

  private async runPrices(): Promise<void> {
    const registry = await this.blockscout.searchRegistry();
    if (registry) {
      await syncRobinhoodPrices(this.store(), registry);
    }
    if (this.priceFeed.url) {
      await syncPrices(this.store(), await this.priceFeed.prices());
    }
  }

  private async runCandles(): Promise<void> {
    await syncCandles(this.store(), this.priceFeed, this.yahoo, this.hotPairs);
  }

  private async runTransactions(): Promise<void> {
    await syncTransactions(this.store(), this.indexer);
  }

  private whaleCycles = 0;
  private goldskyWhale: GoldskyWhaleProvider | null = null;

  /**
   * Unified live whale-activity pipeline:
   *   PRIMARY   Blockscout v2 token transfers (DEX evidence + real ts)
   *   SECONDARY Goldsky subgraph TransferEvents (real ts, TRANSFER-only)
   *   FALLBACK  RPC eth_getLogs (no ts, TRANSFER-only)
   * Higher-priority sources upgrade lower-priority rows in place.
   */
  private async runWhaleActivity(): Promise<void> {
    const d = this.store().get();
    const markets = Object.values(d.markets).filter((m) => m.verified === true);
    if (markets.length === 0) return;

    const providers: WhaleActivityProvider[] = [new BlockscoutWhaleProvider(this.blockscout)];
    if (SYNC_CONFIG.goldskySubgraphUrl) {
      this.goldskyWhale ??= new GoldskyWhaleProvider(
        new GoldskyTokenIntelligence(SYNC_CONFIG.goldskySubgraphUrl),
      );
      providers.push(this.goldskyWhale);
    }
    providers.push(new RpcLogsWhaleProvider(this.rpc, this.store()));

    const result = await syncWhaleActivity(this.store(), {
      markets: markets.map((m) => ({
        address: m.address,
        symbol: m.symbol,
        decimals: m.decimals,
      })),
      cycleIndex: this.whaleCycles,
      maxPerCycle: 3,
      providers,
    });
    this.whaleCycles += 1;
    if (result.added > 0 || result.upgraded > 0) {
      console.log(
        `[recode] whale-activity: +${result.added} new, ${result.upgraded} upgraded ` +
          `(whales +${result.whalesAdded}/~${result.whalesUpgraded}) via ${result.sources.join("+") || "none"}`,
      );
    }
  }

  private async runWhales(): Promise<void> {
    await syncWhales(this.store(), this.indexer);
  }

  private async runLiquidity(): Promise<void> {
    await syncLiquidity(this.store(), this.indexer);
  }

  private async runHolders(): Promise<void> {
    /**
     * Token intelligence holders task — PRIMARY = RECODE_INDEXER_URL
     * (TokenIntelligenceProvider abstraction), FALLBACK = Blockscout
     * (kept for resilience; currently 403-prone). Failure chain per
     * spec: primary → fresh cache → fallback → stale cache → explicit
     * unavailable. Whale USD is computed internally (balance × verified
     * price); provider pre-calculated USD values are never trusted.
     */
    const d = this.store().get();
    const markets = Object.values(d.markets).filter((m) => m.symbol);
    if (markets.length === 0) return;
    const rotated = [...markets.slice(this.holderCursor), ...markets.slice(0, this.holderCursor)];
    this.holderCursor = (this.holderCursor + 10) % markets.length;
    const primary = createPrimaryIntelProvider(SYNC_CONFIG.goldskySubgraphUrl, this.indexer);
    const fallback = new BlockscoutTokenIntelligence(this.blockscout, (addr) => {
      const m = this.store().get().markets[addr];
      return m?.decimals ?? null;
    });
    let updated = 0;
    let degraded = 0;
    for (const market of rotated.slice(0, 10)) {
      const totalSupply = normalizeSupplyRaw(market.totalSupply, market.decimals);
      const price = this.store().get().prices[market.address]?.price ?? null;
      const outcome = await resolveHolders(
        primary,
        fallback,
        this.store(),
        market.address,
        totalSupply,
        SYNC_CONFIG.intervals.holdersMs,
      );
      if (outcome.ok) {
        persistHoldersIntel(this.store(), market.address, outcome.data, outcome.provenance, price);
        updated += 1;
        if (outcome.provenance.provider.startsWith("cache")) degraded += 1;
      }
    }
    if (updated > 0 || primary) {
      console.log(
        `[recode] holders-intel: updated ${updated} markets (provider=${primary?.health().provider ?? "blockscout-fallback"}, cache-degraded=${degraded}, jitterMs=${jitter(100)})`,
      );
    }
  }

  private async runWallets(): Promise<void> {
    await syncWallets(this.store(), this.indexer);
  }

  private async runPrune(): Promise<void> {
    this.store().prune(
      SYNC_CONFIG.retention.historyMs,
      SYNC_CONFIG.retention.transactions,
      SYNC_CONFIG.retention.whales,
      SYNC_CONFIG.retention.discovery,
    );
  }
}

const g = globalThis as unknown as { __recodeSyncEngine?: MarketSyncEngine };

export function getMarketSyncEngine(): MarketSyncEngine {
  g.__recodeSyncEngine ??= new MarketSyncEngine();
  return g.__recodeSyncEngine;
}