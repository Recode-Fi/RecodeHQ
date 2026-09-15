import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asEvmAddress, asFiniteNumber, asNonEmptyString, errorMessage, jitter } from "../util";
import { RateLimitError, SkipError } from "./rpc";

/**
 * REST indexer provider (markets, holders, transactions, whales, liquidity, wallets).
 * Expected optional indexer endpoints (JSON):
 *   GET /markets              -> [{ address, symbol?, name?, assetType?, underlying?, circulatingSupply? }]
 *   GET /transactions?since=  -> [{ hash, ts, wallet?, action, amount?, usd?, symbol?, address? }]
 *   GET /whales?since=        -> [{ id, ts, wallet?, symbol?, address?, kind, usd? }]
 *   GET /liquidity            -> { [address]: { symbol?, total?, buy?, sell?, change24h?, providers?, pools? } }
 *   GET /holders/{address}    -> { symbol?, total?, new24h?, lost24h?, growthPct?, concentration?, top?: [{ address, sharePct?, balance?, usd? }] }
 *   GET /wallets              -> [{ address, portfolioUsd?, activityScore?, lastActive? }]
 */
export class IndexerProvider {
  readonly state: ProviderState;
  private nextAllowedAt = 0;

  constructor(public readonly url: string | null) {
    this.state = {
      configured: Boolean(url),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.url) throw new SkipError("Indexer not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Indexer backing off");
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(`${this.url}${path}`, {
        headers: { accept: "application/json", "user-agent": SYNC_CONFIG.userAgent },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) throw new RateLimitError(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return json;
    } catch (err) {
      this.state.ok = false;
      this.state.consecutiveFailures += 1;
      this.state.lastError = errorMessage(err);
      const delay = Math.min(
        SYNC_CONFIG.maxBackoffMs,
        2_000 * 2 ** Math.min(this.state.consecutiveFailures, 6),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(250);
      throw err;
    }
  }

  async markets(): Promise<
    { address: string; symbol: string | null; name: string | null; assetType: string | null; underlying: string | null; circulatingSupply: string | null }[] | null
  > {
    try {
      const raw = await this.get<unknown[]>("/markets");
      if (!Array.isArray(raw)) return null;
      const out: {
        address: string; symbol: string | null; name: string | null;
        assetType: string | null; underlying: string | null; circulatingSupply: string | null;
      }[] = [];
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const address = asEvmAddress(rec.address);
        if (!address) continue;
        out.push({
          address,
          symbol: asNonEmptyString(rec.symbol),
          name: asNonEmptyString(rec.name),
          assetType: asNonEmptyString(rec.assetType),
          underlying: asNonEmptyString(rec.underlying),
          circulatingSupply: asNonEmptyString(rec.circulatingSupply),
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  async transactionsSince(sinceTs: number): Promise<
    { hash: string; ts: number; wallet: string | null; action: string; amount: number | null; usd: number | null; symbol: string | null; address: string | null }[] | null
  > {
    try {
      const raw = await this.get<unknown[]>(`/transactions?since=${Math.floor(sinceTs)}`);
      if (!Array.isArray(raw)) return null;
      const out: {
        hash: string; ts: number; wallet: string | null; action: string;
        amount: number | null; usd: number | null; symbol: string | null; address: string | null;
      }[] = [];
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const hash = asNonEmptyString(rec.hash);
        const ts = asFiniteNumber(rec.ts);
        if (!hash || ts == null) continue;
        out.push({
          hash,
          ts,
          wallet: asEvmAddress(rec.wallet),
          action: asNonEmptyString(rec.action) ?? "transfer",
          amount: asFiniteNumber(rec.amount),
          usd: asFiniteNumber(rec.usd),
          symbol: asNonEmptyString(rec.symbol),
          address: asEvmAddress(rec.address),
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  async whalesSince(sinceTs: number): Promise<
    { id: string; ts: number; wallet: string | null; symbol: string | null; address: string | null; kind: string; usd: number | null }[] | null
  > {
    try {
      const raw = await this.get<unknown[]>(`/whales?since=${Math.floor(sinceTs)}`);
      if (!Array.isArray(raw)) return null;
      const out: {
        id: string; ts: number; wallet: string | null; symbol: string | null;
        address: string | null; kind: string; usd: number | null;
      }[] = [];
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const id = asNonEmptyString(rec.id) ?? asNonEmptyString(rec.hash);
        const ts = asFiniteNumber(rec.ts);
        if (!id || ts == null) continue;
        out.push({
          id,
          ts,
          wallet: asEvmAddress(rec.wallet),
          symbol: asNonEmptyString(rec.symbol),
          address: asEvmAddress(rec.address),
          kind: asNonEmptyString(rec.kind) ?? "transfer",
          usd: asFiniteNumber(rec.usd),
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  async liquidity(): Promise<Record<string, Record<string, unknown>> | null> {
    try {
      const raw = await this.get<Record<string, Record<string, unknown>>>("/liquidity");
      if (!raw || typeof raw !== "object") return null;
      const out: Record<string, Record<string, unknown>> = {};
      for (const [address, value] of Object.entries(raw)) {
        const addr = asEvmAddress(address);
        if (addr && value && typeof value === "object") out[addr] = value;
      }
      return out;
    } catch {
      return null;
    }
  }

  async holders(address: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await this.get<Record<string, unknown>>(`/holders/${address}`);
      return raw && typeof raw === "object" ? raw : null;
    } catch {
      return null;
    }
  }

  async wallets(): Promise<
    { address: string; portfolioUsd: number | null; activityScore: number | null; lastActive: number | null }[] | null
  > {
    try {
      const raw = await this.get<unknown[]>("/wallets");
      if (!Array.isArray(raw)) return null;
      const out: {
        address: string; portfolioUsd: number | null;
        activityScore: number | null; lastActive: number | null;
      }[] = [];
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const address = asEvmAddress(rec.address);
        if (!address) continue;
        out.push({
          address,
          portfolioUsd: asFiniteNumber(rec.portfolioUsd),
          activityScore: asFiniteNumber(rec.activityScore),
          lastActive: asFiniteNumber(rec.lastActive),
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------------
   * Token intelligence interface (TokenIntelligenceProvider surface).
   * These complete the primary indexer contract: raw holder rows,
   * single-holder balance, token transfers, total supply and token
   * metadata. All tolerant: malformed rows are skipped, never guessed.
   * ------------------------------------------------------------------ */

  /** Raw holder rows for a token: [{ address, balance?, sharePct?, valueRaw?, usd? }]. */
  async tokenHolders(
    address: string,
  ): Promise<
    { address: string; balance: number | null; sharePct: number | null; usd: number | null }[] | null
  > {
    const raw = await this.holders(address);
    if (!raw) return null;
    const total = asFiniteNumber(raw.total);
    const rows = Array.isArray(raw.top) ? raw.top : [];
    const out: { address: string; balance: number | null; sharePct: number | null; usd: number | null }[] = [];
    for (const item of rows) {
      const rec = item as Record<string, unknown>;
      const holder = asEvmAddress(rec.address);
      if (!holder) continue;
      let balance = asFiniteNumber(rec.balance);
      // Tolerate raw-value rows (normalized here with decimals when given).
      const valueRaw = asNonEmptyString(rec.valueRaw ?? rec.value);
      if (balance == null && valueRaw) {
        try {
          balance = Number(BigInt(valueRaw)) / 10 ** (asFiniteNumber(rec.decimals) ?? 18);
        } catch {
          balance = null;
        }
      }
      let sharePct = asFiniteNumber(rec.sharePct);
      if (sharePct == null && balance != null && total != null && total > 0) {
        sharePct = (balance / total) * 100;
      }
      out.push({ address: holder, balance, sharePct, usd: asFiniteNumber(rec.usd) });
    }
    return out;
  }

  /** Raw holder rows INCLUDING the indexer-reported total holder count. */
  async holdersFull(
    address: string,
  ): Promise<{
    total: number | null;
    rows: { address: string; balance: number | null; sharePct: number | null; usd: number | null }[];
  } | null> {
    const raw = await this.holders(address);
    if (!raw) return null;
    const rows = await this.tokenHolders(address);
    return { total: asFiniteNumber(raw.total), rows: rows ?? [] };
  }

  /** One holder's token balance (whole tokens) — GET /holders/{token}/{holder}. */
  async holderBalance(token: string, holder: string): Promise<number | null> {
    try {
      const raw = await this.get<Record<string, unknown>>(`/holders/${token}/${holder}`);
      if (!raw) return null;
      const balance = asFiniteNumber(raw.balance);
      if (balance != null) return balance;
      const valueRaw = asNonEmptyString(raw.valueRaw ?? raw.value);
      if (valueRaw) {
        try {
          return Number(BigInt(valueRaw)) / 10 ** (asFiniteNumber(raw.decimals) ?? 18);
        } catch {
          return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Token transfers: [{ hash, ts, from, to, amount?, usd? }] (ts = epoch ms). */
  async tokenTransfers(
    token: string,
    limit = 50,
  ): Promise<{ hash: string; ts: number; from: string; to: string; amount: number | null; usd: number | null }[] | null> {
    try {
      const raw = await this.get<unknown[]>(`/transfers/${token}?limit=${limit}`);
      if (!Array.isArray(raw)) return null;
      const out: { hash: string; ts: number; from: string; to: string; amount: number | null; usd: number | null }[] = [];
      for (const item of raw) {
        const rec = item as Record<string, unknown>;
        const hash = asNonEmptyString(rec.hash ?? rec.txHash ?? rec.transaction_hash);
        const ts = asFiniteNumber(rec.ts);
        const from = asEvmAddress(rec.from);
        const to = asEvmAddress(rec.to);
        if (!hash || ts == null || !from || !to) continue;
        out.push({ hash, ts, from, to, amount: asFiniteNumber(rec.amount), usd: asFiniteNumber(rec.usd) });
      }
      return out;
    } catch {
      return null;
    }
  }

  /** Chain/indexer total supply: GET /supply/{token} → { totalSupplyRaw, decimals? }. */
  async tokenSupply(token: string): Promise<{ totalSupplyRaw: string; decimals: number | null } | null> {
    try {
      const raw = await this.get<Record<string, unknown>>(`/supply/${token}`);
      if (!raw) return null;
      const totalSupplyRaw = asNonEmptyString(raw.totalSupplyRaw ?? raw.total_supply ?? raw.value);
      if (!totalSupplyRaw) return null;
      return { totalSupplyRaw, decimals: asFiniteNumber(raw.decimals) };
    } catch {
      return null;
    }
  }

  /** Token contract metadata: GET /metadata/{token}. */
  async tokenMetadata(
    token: string,
  ): Promise<{ symbol: string | null; name: string | null; decimals: number | null; totalSupplyRaw: string | null; logoUrl: string | null } | null> {
    try {
      const raw = await this.get<Record<string, unknown>>(`/metadata/${token}`);
      if (!raw || typeof raw !== "object") return null;
      return {
        symbol: asNonEmptyString(raw.symbol),
        name: asNonEmptyString(raw.name),
        decimals: asFiniteNumber(raw.decimals),
        totalSupplyRaw: asNonEmptyString(raw.totalSupplyRaw ?? raw.total_supply),
        logoUrl: asNonEmptyString(raw.logoUrl ?? raw.logo),
      };
    } catch {
      return null;
    }
  }

  /**
   * Provider health for the intelligence layer — role-aware, timestamped.
   * `ok === null` means the provider has never been attempted.
   */
  health(): { provider: "indexer-primary"; url: string | null; state: ProviderState } {
    return { provider: "indexer-primary", url: this.url, state: { ...this.state } };
  }
}