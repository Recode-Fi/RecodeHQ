import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asFiniteNumber, asNonEmptyString, errorMessage, jitter } from "../util";
import { RateLimitError, SkipError } from "./rpc";

export interface RegistryToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
  totalSupplyRaw: string;
  marketCap: number | null;
  logoUrl: string | null;
  verified: boolean;
}

export interface BlockscoutTokenDetail {
  holders: number | null;
  volume24h: number | null;
  exchangeRate: number | null;
  totalSupplyRaw: string | null;
  decimals: number | null;
  txCount: number | null;
}

export interface BlockscoutHolder {
  address: string;
  valueRaw: string;
}

export interface BlockscoutTransfer {
  id: string;
  txHash: string;
  from: string;
  to: string;
  fromName: string | null;
  toName: string | null;
  fromIsContract: boolean;
  toIsContract: boolean;
  amount: number;
  ts: number;
  tokenSnapshot: {
    exchangeRate: number | null;
    volume24h: number | null;
    holdersCount: number | null;
    marketCap: number | null;
    decimals: number | null;
    totalSupplyRaw: string | null;
    logoUrl: string | null;
  } | null;
}

/**
 * Robinhood Chain explorer (Blockscout) provider — the verified on-chain
 * indexer that is actually reachable. Registry discovery via
 * /api/v2/search?q=Robinhood Token returns the official token set with
 * live exchange rates, verified-supply market caps and logos.
 */
export class BlockscoutProvider {
  readonly state: ProviderState;
  private nextAllowedAt = 0;
  private memo: { at: number; data: RegistryToken[] | null } | null = null;

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

  private async get<T>(path: string, timeoutMs = SYNC_CONFIG.requestTimeoutMs): Promise<T> {
    if (!this.url) throw new SkipError("Blockscout not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Blockscout backing off");
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
        3_000 * 2 ** Math.min(this.state.consecutiveFailures, 6),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(400);
      throw err;
    }
  }

  /**
   * Full official registry in one call: every admin-verified
   * "• Robinhood Token" ERC-20 with live exchange rate, verified supply
   * and verified circulating market cap.
   */
  async searchRegistry(): Promise<RegistryToken[] | null> {
    if (this.memo && Date.now() - this.memo.at < 30_000) return this.memo.data;
    const raw = await this.get<{ items?: Record<string, unknown>[] }>(
      "/api/v2/search?q=Robinhood%20Token",
      30_000,
    );
    const items = raw.items ?? [];
    const out: RegistryToken[] = [];
    for (const item of items) {
      if ((item.type as string) !== "token") continue;
      if (item.is_verified_via_admin_panel !== true) continue;
      const name = asNonEmptyString(item.name);
      const symbol = asNonEmptyString(item.symbol);
      const address = asNonEmptyString(item.address_hash);
      const price = asFiniteNumber(item.exchange_rate);
      if (!name || !symbol || !address || !name.includes("Robinhood Token")) continue;
      if (price == null || price <= 0) continue;
      out.push({
        address: address.toLowerCase(),
        symbol,
        name,
        price,
        totalSupplyRaw: asNonEmptyString(item.total_supply) ?? "0",
        marketCap: asFiniteNumber(item.circulating_market_cap),
        logoUrl: asNonEmptyString(item.icon_url),
        verified: true,
      });
    }
    this.memo = { at: Date.now(), data: out };
    return out;
  }

  /** Token detail: holder count, 24h volume, tx count (heavy endpoint). */
  async tokenDetail(address: string): Promise<BlockscoutTokenDetail | null> {
    try {
      const j = await this.get<Record<string, unknown>>(
        `/api/v2/tokens/${address}`,
        60_000,
      );
      return {
        holders: asFiniteNumber(j.holders),
        volume24h: asFiniteNumber(j.volume_24h),
        exchangeRate: asFiniteNumber(j.exchange_rate),
        totalSupplyRaw: asNonEmptyString(j.total_supply),
        decimals: asFiniteNumber(j.decimals),
        txCount: asFiniteNumber(j.tx_count),
      };
    } catch {
      return null;
    }
  }

  async holders(address: string, limit = 100): Promise<BlockscoutHolder[] | null> {
    try {
      const raw = await this.get<{ items?: Record<string, unknown>[] }>(
        `/api/v2/tokens/${address}/holders`,
        60_000,
      );
      const items = raw.items ?? [];
      const out: BlockscoutHolder[] = [];
      for (const item of items) {
        if (out.length >= limit) break;
        const addr = asNonEmptyString((item.address as Record<string, unknown>)?.hash);
        const value = asNonEmptyString(item.value);
        if (!addr || !value) continue;
        out.push({ address: addr.toLowerCase(), valueRaw: value });
      }
      return out.slice(0, limit);
    } catch {
      return null;
    }
  }

  async transfers(address: string, limit = 50): Promise<BlockscoutTransfer[] | null> {
    try {
      const raw = await this.get<{ items?: Record<string, unknown>[] }>(
        `/api/v2/tokens/${address}/transfers`,
        60_000,
      );
      const items = raw.items ?? [];
      const out: BlockscoutTransfer[] = [];
      for (const item of items) {
        const txHash = asNonEmptyString(item.transaction_hash);
        const fromRec = item.from as Record<string, unknown> | undefined;
        const toRec = item.to as Record<string, unknown> | undefined;
        const from = asNonEmptyString(fromRec?.hash);
        const to = asNonEmptyString(toRec?.hash);
        const ts = asNonEmptyString(item.timestamp);
        const total = (item.total as Record<string, unknown> | undefined) ?? {};
        const valueRaw = asNonEmptyString(total.value);
        const dec = asFiniteNumber(total.decimals);
        if (!txHash || !from || !to || !ts || valueRaw == null || dec == null) continue;
        let amount: number | null = null;
        try {
          amount = Number(BigInt(valueRaw)) / 10 ** dec;
        } catch {
          continue;
        }
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const parsedTs = Date.parse(ts);
        const token = item.token as Record<string, unknown> | undefined;
        out.push({
          // Stable event identity: log index when the explorer provides it,
          // else a deterministic from:to:value key. Never a batch position —
          // a positional fallback changes between polls and defeats dedup,
          // duplicating the same transfer into the feed.
          id: `${txHash}:${asNonEmptyString(item.log_index) ?? `${from}:${to}:${valueRaw}`}`,
          txHash,
          from: from.toLowerCase(),
          to: to.toLowerCase(),
          fromName: asNonEmptyString(fromRec?.name),
          toName: asNonEmptyString(toRec?.name),
          fromIsContract: fromRec?.is_contract === true,
          toIsContract: toRec?.is_contract === true,
          amount,
          ts: Number.isFinite(parsedTs) ? parsedTs : Date.now(),
          tokenSnapshot: token
            ? {
                exchangeRate: asFiniteNumber(token.exchange_rate),
                volume24h: asFiniteNumber(token.volume_24h),
                holdersCount: asFiniteNumber(token.holders_count),
                marketCap: asFiniteNumber(token.circulating_market_cap),
                decimals: asFiniteNumber(token.decimals),
                totalSupplyRaw: asNonEmptyString(token.total_supply),
                logoUrl: asNonEmptyString(token.icon_url),
              }
            : null,
        });
        if (out.length >= limit) break;
      }
      return out;
    } catch {
      return null;
    }
  }
}