import { SYNC_CONFIG } from "../config";
import type { CandleTimeframe, SyncCandle, SyncPrice, ProviderState } from "../types";
import { asEvmAddress, asFiniteNumber, asNonEmptyString, asPositiveNumber, errorMessage, jitter } from "../util";
import { RateLimitError, SkipError } from "./rpc";

/**
 * Price/candle feed provider. Validates every row: prices must be finite and
 * strictly positive, candle rows must be internally consistent â€” invalid rows
 * are skipped so the store only ever contains confirmed values.
 */
export class PriceFeedProvider {
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
    if (!this.url) throw new SkipError("Price feed not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Price feed backing off");
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

  async prices(): Promise<SyncPrice[]> {
    const raw = await this.get<unknown[]>("/prices");
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    const out: SyncPrice[] = [];
    for (const item of raw) {
      const rec = item as Record<string, unknown>;
      const address = asEvmAddress(rec.address);
      const symbol = asNonEmptyString(rec.symbol);
      const price = asPositiveNumber(rec.price);
      if (!address || !symbol || price == null) continue;
      out.push({
        address,
        symbol,
        price,
        bid: asFiniteNumber(rec.bid),
        ask: asFiniteNumber(rec.ask),
        marketCap: asFiniteNumber(rec.marketCap),
        change24hPct: asFiniteNumber(rec.change24hPct),
        change24hValue: asFiniteNumber(rec.change24hValue),
        open: asFiniteNumber(rec.open),
        high: asFiniteNumber(rec.high),
        low: asFiniteNumber(rec.low),
        previousClose: asFiniteNumber(rec.previousClose),
        volume1h: asFiniteNumber(rec.volume1h),
        volume24h: asFiniteNumber(rec.volume24h),
        volume7d: asFiniteNumber(rec.volume7d),
        buyVolume24h: asFiniteNumber(rec.buyVolume24h),
        sellVolume24h: asFiniteNumber(rec.sellVolume24h),
        avgTradeSize: asFiniteNumber(rec.avgTradeSize),
        halted: typeof rec.trading_halt === "boolean" ? rec.trading_halt : null,
        updatedAt: now,
        source: "price-feed",
      });
    }
    return out;
  }

  async candles(symbol: string, tf: CandleTimeframe, limit: number): Promise<SyncCandle[]> {
    const raw = await this.get<unknown[]>(
      `/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=${limit}`,
    );
    if (!Array.isArray(raw)) return [];
    const out: SyncCandle[] = [];
    for (const item of raw) {
      const rec = item as Record<string, unknown>;
      const t = asFiniteNumber(rec.t);
      const o = asFiniteNumber(rec.o);
      const h = asFiniteNumber(rec.h);
      const l = asFiniteNumber(rec.l);
      const c = asFiniteNumber(rec.c);
      const v = asFiniteNumber(rec.v);
      if (t == null || o == null || h == null || l == null || c == null) continue;
      if (h < l || h < Math.max(o, c) || l > Math.min(o, c)) continue;
      out.push({ t, o, h, l, c, v });
      if (out.length >= SYNC_CONFIG.retention.maxCandles) break;
    }
    return out;
  }
}


