import { SOLANA_CONFIG } from "./config";
import { getSolanaStore, type SolanaStore } from "./store";
import {
  DexScreenerProvider,
  bestPair,
  marketFields,
  type DexPair,
} from "./providers/dexscreener";
import { SolanaRpcProvider } from "./providers/solanaRpc";
import { computeRadarSignals } from "./services/radar";
import type { SolanaEngineStatus, SolanaToken, SolanaWhaleEvent } from "./types";

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
 * SOLANA — background sync engine
 * ============================================================
 * A fully independent pipeline for Solana mainnet (it never
 * touches the EVM MarketSyncEngine's store or providers):
 *
 *   discovery  — DexScreener token profiles + boosts (Solana mints)
 *   markets    — per-mint DEX pairs (price, liquidity, volume, txns,
 *                change, DEX/pair, mcap/FDV, logos) in batches of 30
 *   holders    — getTokenLargestAccounts + supply (concentration)
 *   whales     — balance-delta of the largest accounts between
 *                cycles → transfer / accumulation / distribution
 *   radar      — rule-based signals over verified stored data
 *   prune      — retention
 *
 * Data-integrity rules: null stays null; whale USD is only set
 * when a verified price exists; every event carries its source.
 */
export class SolanaSyncEngine {
  readonly chain = SOLANA_CONFIG.chain;
  readonly dexscreener = new DexScreenerProvider(SOLANA_CONFIG.dexscreenerUrl);
  readonly rpc = new SolanaRpcProvider(SOLANA_CONFIG.rpcUrl);

  private running = false;
  private startedAt: number | null = null;
  private tasks: TaskState[] = [
    newTask("solanaDiscovery", "Solana token discovery"),
    newTask("solanaMarkets", "Solana DEX market data"),
    newTask("solanaHolders", "Solana holder concentration"),
    newTask("solanaWhales", "Solana whale deltas"),
    newTask("solanaRadar", "Solana radar signals"),
    newTask("solanaPrune", "Solana retention"),
  ];
  private timers: NodeJS.Timeout[] = [];
  private holderCursor = 0;
  private whaleCursor = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    const every = (ms: number, fn: () => Promise<void>, delay = 0) => {
      const t = setInterval(() => {
        void fn();
      }, ms);
      if (typeof t.unref === "function") t.unref();
      this.timers.push(t);
      if (delay > 0) {
        const first = setTimeout(() => void fn(), delay);
        if (typeof first.unref === "function") first.unref();
      } else {
        void fn();
      }
    };
    every(SOLANA_CONFIG.discoveryMs, () => this.runDiscovery());
    every(SOLANA_CONFIG.marketsMs, () => this.runMarkets(), 2_000);
    every(SOLANA_CONFIG.holdersMs * 5, () => this.runHolders(), 8_000);
    every(SOLANA_CONFIG.whalesMs, () => this.runWhales(), 12_000);
    every(60_000, () => this.runRadar(), 20_000);
    every(1_800_000, () => this.runPrune(), 30_000);
    console.log(
      `[recode] solana-engine: started (network=${SOLANA_CONFIG.network}, dexscreener=${this.dexscreener.configured}, rpc=${this.rpc.configured})`,
    );
  }

  ensureStarted(): void {
    this.start();
  }

  private store(): SolanaStore {
    return getSolanaStore();
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

  status(): SolanaEngineStatus {
    const d = this.store().get();
    const freshCount = Object.values(d.tokens).filter(
      (t) => Date.now() - t.updatedAt <= SOLANA_CONFIG.priceFreshnessMs,
    ).length;
    const providerOk = (this.dexscreener.state.ok || this.rpc.state.ok) ?? null;
    const mode: SolanaEngineStatus["mode"] =
      Object.keys(d.tokens).length === 0
        ? "standby"
        : freshCount > 0
          ? "live"
          : providerOk === false
            ? "degraded"
            : "syncing";
    return {
      running: this.running,
      startedAt: this.startedAt,
      chain: SOLANA_CONFIG.chain,
      network: SOLANA_CONFIG.network,
      mode,
      providers: {
        dexscreener: this.dexscreener.state,
        rpc: this.rpc.state,
      },
      tasks: this.tasks,
      tokensIndexed: Object.keys(d.tokens).length,
      whalesStored: d.whales.length,
      signalsStored: d.radar.length,
      updatedAt: d.updatedAt,
    };
  }

  /* ── Discovery ──────────────────────────────────────────── */

  private async runDiscovery(): Promise<void> {
    await this.run("solanaDiscovery", async () => {
      const store = this.store();
      const d = store.get();
      const now = Date.now();
      // Boosted (actively traded) tokens first, then the profile universe.
      const [boosts, profiles] = await Promise.all([
        this.dexscreener.solanaBoosts().catch(() => []),
        this.dexscreener.solanaProfiles().catch(() => []),
      ]);
      const ranked: string[] = [];
      const seen = new Set<string>();
      const push = (mint: string) => {
        if (seen.has(mint) || ranked.length >= SOLANA_CONFIG.maxTokens) return;
        seen.add(mint);
        ranked.push(mint);
      };
      push(DexScreenerProvider.WSOL_MINT);
      for (const b of boosts) push(b.tokenAddress as string);
      for (const p of profiles) push(p.tokenAddress as string);

      let added = 0;
      for (const mint of ranked) {
        if (!d.tokens[mint]) {
          d.tokens[mint] = {
            mint,
            symbol: null,
            name: null,
            logoUrl: null,
            decimals: null,
            priceUsd: null,
            marketCap: null,
            fdv: null,
            liquidityUsd: null,
            volume24hUsd: null,
            volume6hUsd: null,
            volume1hUsd: null,
            change24hPct: null,
            buys24h: null,
            sells24h: null,
            txns24h: null,
            dexId: null,
            pairAddress: null,
            pairCreatedAt: null,
            websites: null,
            socials: null,
            supply: null,
            firstSeen: now,
            updatedAt: 0,
            sources: [],
          };
          added += 1;
        }
      }
      // Profile icons fill logos the DEX pair payload lacks.
      for (const p of profiles) {
        const t = d.tokens[p.tokenAddress as string];
        if (t && !t.logoUrl && p.icon) t.logoUrl = p.icon;
      }
      d.updatedAt = now;
      store.save();
      if (added > 0) {
        console.log(
          `[recode] solana-discovery: +${added} mints (tracked ${Object.keys(d.tokens).length})`,
        );
      }
    });
  }

  /* ── Markets (DEX pairs, batched) ───────────────────────── */

  private async runMarkets(): Promise<void> {
    await this.run("solanaMarkets", async () => {
      const store = this.store();
      const d = store.get();
      const mints = Object.values(d.tokens).sort((a, b) => a.updatedAt - b.updatedAt);
      if (mints.length === 0) return;
      const now = Date.now();
      // One batch per cycle (30 mints) — stalest first.
      const batch = mints.slice(0, SOLANA_CONFIG.batchMints).map((t) => t.mint);
      const pairs = await this.dexscreener.tokenPairs(batch);
      const byMint = new Map<string, DexPair[]>();
      for (const p of pairs) {
        const arr = byMint.get(p.baseToken.address) ?? [];
        arr.push(p);
        byMint.set(p.baseToken.address, arr);
      }
      let updated = 0;
      for (const mint of batch) {
        const token = d.tokens[mint];
        if (!token) continue;
        const best = bestPair(byMint.get(mint) ?? [], mint);
        const f = marketFields(best);
        const changed =
          f.priceUsd != null ||
          f.liquidityUsd != null ||
          token.priceUsd !== f.priceUsd ||
          token.volume24hUsd !== f.volume24hUsd;
        token.priceUsd = f.priceUsd ?? token.priceUsd;
        token.marketCap = f.marketCap ?? token.marketCap;
        token.fdv = f.fdv ?? token.fdv;
        token.liquidityUsd = f.liquidityUsd ?? token.liquidityUsd;
        token.volume24hUsd = f.volume24hUsd ?? token.volume24hUsd;
        token.volume6hUsd = f.volume6hUsd ?? token.volume6hUsd;
        token.volume1hUsd = f.volume1hUsd ?? token.volume1hUsd;
        token.change24hPct = f.change24hPct ?? token.change24hPct;
        token.buys24h = f.buys24h ?? token.buys24h;
        token.sells24h = f.sells24h ?? token.sells24h;
        token.txns24h = f.txns24h ?? token.txns24h;
        token.dexId = f.dexId ?? token.dexId;
        token.pairAddress = f.pairAddress ?? token.pairAddress;
        token.pairCreatedAt = f.pairCreatedAt ?? token.pairCreatedAt;
        token.logoUrl = f.logoUrl ?? token.logoUrl;
        token.websites = f.websites ?? token.websites;
        token.socials = f.socials ?? token.socials;
        token.symbol = best?.baseToken.symbol ?? token.symbol;
        token.name = best?.baseToken.name ?? token.name;
        if (best && !token.sources.includes(`dexscreener:${best.dexId}`)) {
          token.sources = [...new Set([...token.sources, `dexscreener:${best.dexId}`])].slice(-4);
        }
        if (changed) {
          token.updatedAt = now;
          updated += 1;
          if (token.priceUsd != null) {
            (d.priceHistory[mint] ??= []).push({ t: now, p: token.priceUsd });
          }
          if (token.volume24hUsd != null) {
            (d.volumeHistory[mint] ??= []).push({ t: now, v: token.volume24hUsd });
          }
          if (token.liquidityUsd != null) {
            (d.liquidityHistory[mint] ??= []).push({ t: now, v: token.liquidityUsd });
          }
        }
      }
      d.updatedAt = now;
      store.save();
      if (updated > 0) {
        console.log(
          `[recode] solana-markets: ${updated} quotes updated (batch of ${batch.length})`,
        );
      }
    });
  }

  /** Mints ordered by tracked importance (volume → liquidity → mcap). */
  private rankedMints(): SolanaToken[] {
    return Object.values(this.store().get().tokens).sort(
      (a, b) =>
        (b.volume24hUsd ?? b.liquidityUsd ?? b.marketCap ?? 0) -
        (a.volume24hUsd ?? a.liquidityUsd ?? a.marketCap ?? 0),
    );
  }

  /* ── Holders (concentration) ────────────────────────────── */

  private async runHolders(): Promise<void> {
    await this.run("solanaHolders", async () => {
      const store = this.store();
      const d = store.get();
      const ranked = this.rankedMints();
      if (ranked.length === 0) return;
      const now = Date.now();
      // Prefer stale holders; fall back to ranked rotation.
      const due = ranked.filter((t) => {
        const h = d.holders[t.mint];
        return !h || now - h.updatedAt >= SOLANA_CONFIG.holdersMs;
      });
      const source = due.length > 0 ? due : ranked;
      const batch = source.slice(0, SOLANA_CONFIG.holdersPerCycle);
      this.holderCursor =
        (this.holderCursor + SOLANA_CONFIG.holdersPerCycle) % Math.max(1, ranked.length);
      for (const token of batch) {
        const largest = await this.rpc.getLargestAccounts(token.mint);
        if (!largest) continue; // unavailable → holders stay unset for this mint
        const owners = await this.rpc.resolveOwners(largest.map((l) => l.address));
        const supply = token.supply ?? (await this.rpc.getTokenSupply(token.mint));
        if (supply != null && supply !== token.supply) token.supply = supply;
        const price = token.priceUsd;
        d.holders[token.mint] = {
          mint: token.mint,
          symbol: token.symbol,
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
              l.amount.uiAmount != null && price != null ? l.amount.uiAmount * price : null,
          })),
          updatedAt: now,
        };
      }
      if (batch.length > 0) store.save();
    });
  }

  /* ── Whales (balance deltas of largest accounts) ────────── */

  private async runWhales(): Promise<void> {
    await this.run("solanaWhales", async () => {
      const store = this.store();
      const d = store.get();
      const ranked = this.rankedMints();
      if (ranked.length === 0) return;
      const start = this.whaleCursor % ranked.length;
      const batch = ranked
        .slice(start, start + SOLANA_CONFIG.whalesPerCycle)
        .map((t) => t.mint);
      this.whaleCursor =
        (this.whaleCursor + SOLANA_CONFIG.whalesPerCycle) % Math.max(1, ranked.length);
      const now = Date.now();
      const events: SolanaWhaleEvent[] = [];
      for (const mint of batch) {
        const token = d.tokens[mint];
        if (!token) continue;
        const largest = await this.rpc.getLargestAccounts(mint);
        if (!largest) continue;
        const owners = await this.rpc.resolveOwners(largest.map((l) => l.address));
        const current: Record<string, number> = {};
        for (const l of largest) {
          if (l.amount.uiAmount != null) current[l.address] = l.amount.uiAmount;
        }
        const prev = d.largestSnapshots[mint];
        if (prev && token.priceUsd != null) {
          events.push(...whaleEventsFromDeltas(mint, token, prev, current, owners, now));
        }
        d.largestSnapshots[mint] = current;
      }
      if (events.length > 0) {
        d.whales = [...events, ...d.whales].slice(0, SOLANA_CONFIG.retention.whales);
        console.log(
          `[recode] solana-whales: +${events.length} events (threshold $${SOLANA_CONFIG.whaleThresholdUsd})`,
        );
      }
      if (batch.length > 0) store.save();
    });
  }

  /* ── Radar signals ──────────────────────────────────────── */

  private async runRadar(): Promise<void> {
    await this.run("solanaRadar", async () => {
      const store = this.store();
      const d = store.get();
      const signals = computeRadarSignals(d, SOLANA_CONFIG);
      if (signals.length > 0) {
        const ids = new Set(signals.map((s) => s.id));
        const merged = [...signals, ...d.radar.filter((s) => !ids.has(s.id))];
        d.radar = merged
          .sort((a, b) => b.detectedAt - a.detectedAt)
          .slice(0, SOLANA_CONFIG.retention.signals);
      }
      store.save();
    });
  }

  private async runPrune(): Promise<void> {
    await this.run("solanaPrune", async () => {
      this.store().prune(
        SOLANA_CONFIG.retention.historyMs,
        SOLANA_CONFIG.retention.whales,
        SOLANA_CONFIG.retention.signals,
      );
    });
  }
}

/**
 * Pure whale-delta classifier (extracted for testability): compares two
 * snapshots of the largest token accounts. Paired in/out within 5% →
 * transfer; unpaired → accumulation/distribution. USD uses the verified
 * price at scan time; events below the threshold are dropped.
 */
export function whaleEventsFromDeltas(
  mint: string,
  token: SolanaToken,
  prev: Record<string, number>,
  current: Record<string, number>,
  owners: Map<string, string>,
  now: number,
  thresholdUsd: number = SOLANA_CONFIG.whaleThresholdUsd,
): SolanaWhaleEvent[] {
  const price = token.priceUsd;
  if (price == null) return [];
  const usdOf = (delta: number) => delta * price;
  const deltas: { account: string; delta: number }[] = [];
  const accounts = new Set([...Object.keys(prev), ...Object.keys(current)]);
  for (const account of accounts) {
    const delta = (current[account] ?? 0) - (prev[account] ?? 0);
    if (delta !== 0) deltas.push({ account, delta });
  }
  const significant = deltas.filter((x) => Math.abs(usdOf(x.delta)) >= thresholdUsd);
  const inflows = significant.filter((x) => x.delta > 0);
  const outflows = significant.filter((x) => x.delta < 0);
  const events: SolanaWhaleEvent[] = [];
  for (const x of significant) {
    const pool = x.delta > 0 ? outflows : inflows;
    const counterpart = pool.find(
      (y) =>
        Math.abs(Math.abs(usdOf(y.delta)) - Math.abs(usdOf(x.delta))) <=
        Math.abs(usdOf(x.delta)) * 0.05,
    );
    events.push({
      id: `${mint}:${x.account}:${now}`,
      mint,
      symbol: token.symbol,
      wallet: owners.get(x.account) ?? x.account,
      kind: counterpart ? "transfer" : x.delta > 0 ? "accumulation" : "distribution",
      amount: x.delta,
      usd: usdOf(x.delta),
      sharePctAfter:
        token.supply != null && token.supply > 0 && current[x.account] != null
          ? (current[x.account] / token.supply) * 100
          : null,
      observedAt: now,
      source: "solana-rpc:largest-account-delta",
    });
  }
  return events;
}

const g = globalThis as unknown as { __recodeSolanaEngine?: SolanaSyncEngine };

export function getSolanaSyncEngine(): SolanaSyncEngine {
  g.__recodeSolanaEngine ??= new SolanaSyncEngine();
  return g.__recodeSolanaEngine;
}