import type { EvmChainConfig } from "./types";
import { evmNetConfig } from "./config";
import { getEvmNetStore, type EvmNetStore } from "./store";
import type { EvmNetToken } from "./types";
import {
  EvmNetDexScreenerProvider,
  evmNetMarketFields,
  type EvmNetDexPair,
} from "./providers/dexscreener";
import { EvmNetRpcProvider } from "./providers/evmRpc";
import { computeEvmNetRadar } from "./services/radar";

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
 * EVM NET — chain-generic background sync engine
 * ============================================================
 * One engine instance per EVM network (ethereum / bsc / arbitrum),
 * each fully isolated (own RPC, own store file, own DexScreener
 * chain filter):
 *   discovery  — DexScreener pairs for this chain
 *   markets    — live pair data (price/liquidity/volume/txns…)
 *   whales     — large canonical-stablecoin transfers via Transfer
 *                logs (every event carries its real tx hash)
 *   radar      — rule-based signals over verified stored data
 * Data integrity: null stays null; no cross-chain substitution.
 */
export class EvmNetEngine {
  readonly dexscreener: EvmNetDexScreenerProvider;
  readonly rpc: EvmNetRpcProvider;
  private running = false;
  private tasks: TaskState[];

  constructor(readonly cfg: EvmChainConfig) {
    const conf = evmNetConfig(cfg.key as "ethereum");
    this.dexscreener = new EvmNetDexScreenerProvider(
      cfg,
      conf.dexscreenerUrl,
      conf.maxTokens,
      conf.requestTimeoutMs,
      conf.userAgent,
    );
    this.rpc = new EvmNetRpcProvider(cfg, conf.requestTimeoutMs, conf.userAgent);
    this.tasks = [
      newTask(`${cfg.key}Discovery`, `${cfg.name} token discovery`),
      newTask(`${cfg.key}Markets`, `${cfg.name} DEX market data`),
      newTask(`${cfg.key}Whales`, `${cfg.name} stablecoin whale transfers`),
      newTask(`${cfg.key}Radar`, `${cfg.name} radar signals`),
      newTask(`${cfg.key}Prune`, `${cfg.name} retention`),
    ];
  }

  private conf() {
    return evmNetConfig(this.cfg.key as "ethereum");
  }

  private store(): EvmNetStore {
    return getEvmNetStore(this.cfg.key);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const conf = this.conf();
    const every = (ms: number, fn: () => Promise<void>, delay = 0) => {
      const t = setInterval(() => void fn(), ms);
      if (typeof t.unref === "function") t.unref();
      if (delay > 0) {
        const first = setTimeout(() => void fn(), delay);
        if (typeof first.unref === "function") first.unref();
      } else {
        void fn();
      }
    };
    every(conf.discoveryMs, () => this.runDiscovery());
    every(conf.marketsMs, () => this.runMarkets(), 2_000);
    every(conf.whalesMs, () => this.runWhales(), 8_000);
    every(90_000, () => this.runRadar(), 25_000);
    every(1_800_000, () => this.runPrune(), 40_000);
    void this.rpc.verifyChain().then((id) => {
      if (id != null && id !== this.cfg.chainId) {
        console.error(
          `[recode] evmnet(${this.cfg.key}): RPC chain id mismatch — got ${id}, expected ${this.cfg.chainId}`,
        );
      }
    });
    console.log(
      `[recode] evmnet(${this.cfg.key}): started (chainId=${this.cfg.chainId}, rpc=${this.rpc.configured})`,
    );
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
    const conf = this.conf();
    return {
      chain: this.cfg.key,
      name: this.cfg.name,
      network: "mainnet",
      chainId: this.cfg.chainId,
      expectedChainId: this.cfg.chainId,
      rpcChainId: this.rpc.state.chainId,
      rpcOk: this.rpc.state.ok,
      rpcLastError: this.rpc.state.lastError,
      explorerUrl: this.cfg.explorerUrl,
      nativeSymbol: this.cfg.nativeSymbol,
      whaleSymbol: this.cfg.whaleSymbol,
      whaleEmitter: this.cfg.whaleEmitter,
      mode: this.rpc.state.ok ? "live" : "standby",
      tokensIndexed: Object.keys(store.tokens).length,
      whalesStored: store.whales.length,
      stablecoinStored: store.stablecoin.length,
      signalsStored: store.radar.length,
      whaleThresholdUsd: conf.whaleThresholdUsd,
      updatedAt: store.updatedAt,
      tasks: this.tasks,
    };
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

  private async runDiscovery(): Promise<void> {
    await this.run(`${this.cfg.key}Discovery`, async () => {
      const pairs = await this.dexscreener.discoverPairs();
      if (pairs == null) return;
      const d = this.store().get();
      const now = Date.now();
      for (const p of pairs) upsertToken(d.tokens, p, now);
      d.updatedAt = now;
      this.store().save();
    });
  }

  private async runMarkets(): Promise<void> {
    await this.run(`${this.cfg.key}Markets`, async () => {
      const d = this.store().get();
      const addresses = Object.keys(d.tokens);
      if (addresses.length === 0) return;
      const now = Date.now();
      for (let i = 0; i < addresses.length; i += 30) {
        const batch = addresses.slice(i, i + 30);
        const pairs = await this.dexscreener.tokens(batch);
        if (pairs == null) continue;
        const best = new Map<string, EvmNetDexPair>();
        for (const p of pairs) {
          const key = p.baseToken?.address?.toLowerCase();
          if (!key) continue;
          const cur = best.get(key);
          if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(key, p);
        }
        for (const [addr, p] of best) {
          const existing = d.tokens[addr];
          if (existing) Object.assign(existing, evmNetMarketFields(p), { updatedAt: now });
        }
      }
      d.updatedAt = now;
      this.store().save();
    });
  }

  private async runWhales(): Promise<void> {
    await this.run(`${this.cfg.key}Whales`, async () => {
      const conf = this.conf();
      const latest = await this.rpc.latestBlock();
      if (latest == null) return;
      const d = this.store().get();
      const from = d.lastScannedBlock != null ? d.lastScannedBlock + 1 : latest - conf.whaleScanBlocks;
      const to = latest;
      if (to <= from) return;
      const logs = await this.rpc.getStablecoinTransfers(from, to);
      if (logs == null) return;
      const now = Date.now();
      const whales = [];
      const stable = [];
      for (const log of logs) {
        if (!Number.isFinite(log.amount) || log.amount <= 0) continue;
        const mint = log.from == null && log.to != null;
        const burn = log.to == null && log.from != null;
        const event = {
          kind: (mint ? "mint" : burn ? "burn" : "transfer") as "mint" | "burn" | "transfer",
          amount: log.amount,
          usd: log.amount,
          symbol: this.cfg.whaleSymbol,
          from: log.from,
          to: log.to,
          txHash: log.txHash,
          blockNumber: log.blockNumber,
          source: `${this.cfg.name} ${this.cfg.whaleSymbol} Transfer log (block ${log.blockNumber})`,
          observedAt: now,
        };
        if (log.amount >= conf.whaleThresholdUsd) whales.push(event);
        if (mint || burn || log.amount >= conf.whaleThresholdUsd / 10) {
          for (const wallet of [log.from, log.to]) {
            if (!wallet) continue;
            const isIncoming = wallet === log.to;
            stable.push({
              kind: (mint
                ? "mint"
                : burn
                  ? "burn"
                  : isIncoming
                    ? "inflow"
                    : log.from === wallet
                      ? "outflow"
                      : "transfer") as "mint" | "burn" | "inflow" | "outflow" | "transfer",
              wallet,
              counterparty: isIncoming ? log.from : log.to,
              amount: log.amount,
              usd: log.amount,
              symbol: this.cfg.whaleSymbol,
              txHash: log.txHash,
              blockNumber: log.blockNumber,
              observedAt: now,
            });
          }
        }
      }
      if (whales.length > 0) {
        d.whales = [...whales, ...d.whales].slice(0, conf.retention.whales);
        console.log(
          `[recode] evmnet(${this.cfg.key}): +${whales.length} ${this.cfg.whaleSymbol} whale events (blocks ${from}-${to})`,
        );
      }
      if (stable.length > 0) {
        d.stablecoin = [...stable, ...d.stablecoin].slice(0, conf.retention.stablecoin);
      }
      d.lastScannedBlock = to;
      d.updatedAt = now;
      this.store().save();
    });
  }

  private async runRadar(): Promise<void> {
    await this.run(`${this.cfg.key}Radar`, async () => {
      const conf = this.conf();
      const d = this.store().get();
      d.radar = computeEvmNetRadar(d.tokens, d.whales, conf.whaleThresholdUsd).slice(
        0,
        conf.retention.signals,
      );
      d.updatedAt = Date.now();
      this.store().save();
    });
  }

  private async runPrune(): Promise<void> {
    await this.run(`${this.cfg.key}Prune`, async () => {
      const conf = this.conf();
      this.store().prune(
        conf.retention.historyMs,
        conf.retention.whales,
        conf.retention.stablecoin,
        conf.retention.signals,
      );
    });
  }
}

function upsertToken(
  tokens: Record<string, EvmNetToken>,
  p: EvmNetDexPair,
  now: number,
): EvmNetToken | null {
  const address = p.baseToken?.address?.toLowerCase();
  if (!address) return null;
  const existing = tokens[address];
  const token: EvmNetToken = existing ?? {
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
  Object.assign(token, evmNetMarketFields(p), { updatedAt: now });
  if (!token.sources.includes("dexscreener")) token.sources.push("dexscreener");
  tokens[address] = token;
  return token;
}