import { ARC_CONFIG, ARC_CHAIN } from "./config";
import { getArcStore, type ArcStore, type ArcToken, type ArcWhaleEvent, type ArcStablecoinEvent } from "./store";
import {
  ArcDexScreenerProvider,
  arcMarketFields,
  type ArcDexPair,
} from "./providers/dexscreener";
import { ArcRpcProvider } from "./providers/arcRpc";
import { computeArcRadar } from "./services/radar";

interface TaskState {
  id: string;
  label: string;
  lastRun: number | null;
  lastSuccess: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
}

function newTask(id: string, label: string): TaskState {
  return { id, label, lastRun: null, lastSuccess: null, lastError: null, runs: 0, failures: 0 };
}

/**
 * ============================================================
 * ARC — background sync engine (independent pipeline)
 * ============================================================
 * Mirrors the Solana architecture for Arc mainnet (chain 5042):
 *   discovery  — DexScreener "arc" pairs (USDC-quoted markets)
 *   markets    — live DEX pair data (price, liquidity, volume, txns…)
 *   whales     — large native-USDC transfers via EIP-7708 system
 *                emitter logs (18 decimals → face-value USDC);
 *                every event carries its real transaction hash
 *   radar      — rule-based signals over verified stored data
 *   prune      — retention
 * Data-integrity rules: null stays null; nothing is fabricated.
 */
export class ArcSyncEngine {
  readonly chain = ARC_CONFIG.chain;
  readonly dexscreener = new ArcDexScreenerProvider(ARC_CONFIG.dexscreenerUrl);
  readonly rpc = new ArcRpcProvider(ARC_CONFIG.rpcUrl);

  private running = false;
  private tasks: TaskState[] = [
    newTask("arcDiscovery", "Arc token discovery"),
    newTask("arcMarkets", "Arc DEX market data"),
    newTask("arcWhales", "Arc USDC whale transfers"),
    newTask("arcRadar", "Arc radar signals"),
    newTask("arcPrune", "Arc retention"),
  ];
  private timers: NodeJS.Timeout[] = [];

  start(): void {
    if (this.running) return;
    this.running = true;
    const every = (ms: number, fn: () => Promise<void>, delay = 0) => {
      const t = setInterval(() => void fn(), ms);
      if (typeof t.unref === "function") t.unref();
      this.timers.push(t);
      if (delay > 0) {
        const first = setTimeout(() => void fn(), delay);
        if (typeof first.unref === "function") first.unref();
      } else {
        void fn();
      }
    };
    every(ARC_CONFIG.discoveryMs, () => this.runDiscovery());
    every(ARC_CONFIG.marketsMs, () => this.runMarkets(), 2_000);
    every(ARC_CONFIG.whalesMs, () => this.runWhales(), 6_000);
    every(60_000, () => this.runRadar(), 20_000);
    every(1_800_000, () => this.runPrune(), 30_000);
    void this.rpc.verifyChain().then((id) => {
      if (id != null && id !== ARC_CHAIN.chainId) {
        console.error(
          `[recode] arc-engine: RPC chain id mismatch — got ${id}, expected ${ARC_CHAIN.chainId}`,
        );
      }
    });
    console.log(
      `[recode] arc-engine: started (network=${ARC_CONFIG.network}, chainId=${ARC_CONFIG.chainId}, rpc=${this.rpc.configured})`,
    );
  }

  /** Bounded one-shot whale scan + radar for cold instances. */
  async warmWhales(): Promise<void> {
    await this.runWhales();
    await this.runRadar();
  }

  ensureStarted(): void {
    this.start();
  }

  /** Bounded one-shot discovery + market refresh for cold instances. */
  async warmUp(): Promise<void> {
    await this.runDiscovery();
    await this.runMarkets();
  }

  status() {
    const store = this.store().get();
    return {
      chain: this.chain,
      network: ARC_CONFIG.network,
      chainId: ARC_CONFIG.chainId,
      expectedChainId: ARC_CHAIN.chainId,
      rpcChainId: this.rpc.state.chainId,
      rpcOk: this.rpc.state.ok,
      rpcLastSuccess: this.rpc.state.lastSuccess,
      rpcLastError: this.rpc.state.lastError,
      explorerUrl: ARC_CHAIN.explorerUrl,
      gasSymbol: ARC_CHAIN.gasSymbol,
      gasDecimals: ARC_CHAIN.gasDecimals,
      usdcErc20: ARC_CHAIN.usdcErc20,
      usdcSystemEmitter: ARC_CHAIN.usdcSystemEmitter,
      mode: this.rpc.state.ok ? "live" : "standby",
      tokensIndexed: Object.keys(store.tokens).length,
      whalesStored: store.whales.length,
      stablecoinStored: store.stablecoin.length,
      signalsStored: store.radar.length,
      updatedAt: store.updatedAt,
      tasks: this.tasks,
    };
  }

  private store(): ArcStore {
    return getArcStore();
  }

  private task(id: string): TaskState {
    return this.tasks.find((t) => t.id === id) ?? this.tasks[0];
  }

  private async run(id: string, fn: () => Promise<void>): Promise<void> {
    const t = this.task(id);
    t.lastRun = Date.now();
    t.runs += 1;
    try {
      await fn();
      t.lastSuccess = Date.now();
      t.lastError = null;
    } catch (err) {
      t.failures += 1;
      t.lastError = err instanceof Error ? err.message : "failed";
    }
  }

  /** DexScreener "arc" discovery → tracked token set. */
  private async runDiscovery(): Promise<void> {
    await this.run("arcDiscovery", async () => {
      const pairs = await this.dexscreener.discoverPairs();
      if (pairs == null) return;
      const d = this.store().get();
      const now = Date.now();
      for (const p of pairs) upsertToken(d.tokens, p, now);
      d.updatedAt = now;
      this.store().save();
    });
  }

  /** Live market refresh for every tracked token (batched, best pair only). */
  private async runMarkets(): Promise<void> {
    await this.run("arcMarkets", async () => {
      const d = this.store().get();
      const addresses = Object.keys(d.tokens);
      if (addresses.length === 0) return;
      const now = Date.now();
      for (let i = 0; i < addresses.length; i += 30) {
        const batch = addresses.slice(i, i + 30);
        const pairs = await this.dexscreener.tokens(batch);
        if (pairs == null) continue;
        // Strongest (most liquid) pair per token — no metric mixing.
        const best = new Map<string, ArcDexPair>();
        for (const p of pairs) {
          const key = p.baseToken?.address?.toLowerCase();
          if (!key) continue;
          const cur = best.get(key);
          if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(key, p);
        }
        for (const [addr, p] of best) {
          const existing = d.tokens[addr];
          if (existing) Object.assign(existing, arcMarketFields(p), { updatedAt: now });
        }
      }
      d.updatedAt = now;
      this.store().save();
    });
  }

  /**
   * Whale scan: large native-USDC transfers in a bounded recent-block
   * window, read from the EIP-7708 system emitter (every event has a
   * real transaction hash; USDC face value = USD).
   */
  private async runWhales(): Promise<void> {
    await this.run("arcWhales", async () => {
      const latest = await this.rpc.latestBlock();
      if (latest == null) return;
      const d = this.store().get();
      const window = ARC_CONFIG.whaleScanBlocks;
      const from = d.lastScannedBlock != null ? d.lastScannedBlock + 1 : latest - window;
      const to = latest;
      if (to <= from) return;
      const logs = await this.rpc.getUsdcTransfers(from, to);
      if (logs == null) return;
      const now = Date.now();
      const whales: ArcWhaleEvent[] = [];
      const stable: ArcStablecoinEvent[] = [];
      for (const log of logs) {
        if (!Number.isFinite(log.amountUsdc) || log.amountUsdc <= 0) continue;
        const mint = log.from == null && log.to != null;
        const burn = log.to == null && log.from != null;
        const kind: ArcWhaleEvent["kind"] = mint ? "mint" : burn ? "burn" : "transfer";
        const event: ArcWhaleEvent = {
          kind,
          amountUsdc: log.amountUsdc,
          usd: log.amountUsdc,
          from: log.from,
          to: log.to,
          txHash: log.txHash,
          blockNumber: log.blockNumber,
          source: `Arc EIP-7708 native-USDC Transfer (system emitter, block ${log.blockNumber})`,
          observedAt: now,
        };
        if (log.amountUsdc >= ARC_CONFIG.whaleThresholdUsd) whales.push(event);
        if (mint || burn || log.amountUsdc >= ARC_CONFIG.whaleThresholdUsd / 10) {
          for (const wallet of [log.from, log.to]) {
            if (!wallet) continue;
            const isIncoming = wallet === log.to;
            stable.push({
              kind: mint
                ? "mint"
                : burn
                  ? "burn"
                  : isIncoming
                    ? "inflow"
                    : log.from === wallet
                      ? "outflow"
                      : "transfer",
              wallet,
              counterparty: isIncoming ? log.from : log.to,
              amountUsdc: log.amountUsdc,
              usd: log.amountUsdc,
              txHash: log.txHash,
              blockNumber: log.blockNumber,
              observedAt: now,
            });
          }
        }
      }
      if (whales.length > 0) {
        d.whales = [...whales, ...d.whales].slice(0, ARC_CONFIG.retention.whales);
        console.log(
          `[recode] arc-whales: +${whales.length} USDC events (threshold $${ARC_CONFIG.whaleThresholdUsd}, blocks ${from}-${to})`,
        );
      }
      if (stable.length > 0) {
        d.stablecoin = [...stable, ...d.stablecoin].slice(0, ARC_CONFIG.retention.stablecoin);
      }
      d.lastScannedBlock = to;
      d.updatedAt = now;
      this.store().save();
    });
  }

  private async runRadar(): Promise<void> {
    await this.run("arcRadar", async () => {
      const d = this.store().get();
      const signals = computeArcRadar(d.tokens, d.whales, ARC_CONFIG.whaleThresholdUsd);
      d.radar = signals.slice(0, ARC_CONFIG.retention.signals);
      d.updatedAt = Date.now();
      this.store().save();
    });
  }

  private async runPrune(): Promise<void> {
    await this.run("arcPrune", async () => {
      this.store().prune(
        ARC_CONFIG.retention.historyMs,
        ARC_CONFIG.retention.whales,
        ARC_CONFIG.retention.stablecoin,
        ARC_CONFIG.retention.signals,
      );
    });
  }
}

function upsertToken(
  tokens: Record<string, ArcToken>,
  p: ArcDexPair,
  now: number,
): ArcToken | null {
  const address = p.baseToken?.address?.toLowerCase();
  if (!address) return null;
  const existing = tokens[address];
  const token: ArcToken = existing ?? {
    address,
    symbol: null,
    name: null,
    logoUrl: null,
    decimals: null,
    priceUsd: null,
    marketCap: null,
    fdv: null,
    liquidity: null,
    volume24h: null,
    change24hPct: null,
    buys24h: null,
    sells24h: null,
    txns24h: null,
    dexId: null,
    pairAddress: null,
    quoteToken: null,
    pairCreatedAt: null,
    updatedAt: null,
    sources: [],
  };
  token.symbol = p.baseToken.symbol ?? token.symbol;
  token.name = p.baseToken.name ?? token.name;
  Object.assign(token, arcMarketFields(p), { updatedAt: now });
  if (!token.sources.includes("dexscreener")) token.sources.push("dexscreener");
  tokens[address] = token;
  return token;
}

const globalEngine = globalThis as unknown as { __recodeArcEngine?: ArcSyncEngine };

export function getArcSyncEngine(): ArcSyncEngine {
  globalEngine.__recodeArcEngine ??= new ArcSyncEngine();
  return globalEngine.__recodeArcEngine;
}