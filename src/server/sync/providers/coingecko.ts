import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { errorMessage, jitter } from "../util";
import { RateLimitError } from "./rpc";

export interface CgMarketRow {
  id: string;
  symbol: string;
  name: string;
  current_price?: number | null;
  market_cap: number | null;
  /** CoinGecko market-cap ranking (provided by the API when present). */
  market_cap_rank?: number | null;
  total_volume: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
  sparkline_in_7d?: { price: number[] } | null;
  last_updated?: string | null;
}

/**
 * CoinGecko market provider (category aggregates). Keyless public API works;
 * an optional demo/pro key is read from COINGECKO_API_KEY (server-side only,
 * never exposed to the browser). 429/5xx trigger exponential backoff so the
 * free tier is never hammered — last valid data stays in the store.
 */
export class CoinGeckoProvider {
  readonly state: ProviderState;
  /** Whether a demo/pro key is configured (never exposes the key itself). */
  readonly keyConfigured: boolean;
  private nextAllowedAt = 0;
  /** In-flight request deduplication: concurrent identical calls share one fetch. */
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly base: string, apiKey?: string | null) {
    this.keyConfigured = Boolean(apiKey && apiKey.trim());
    this.state = {
      configured: Boolean(base),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  get configured(): boolean {
    return Boolean(this.base);
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.base) throw new Error("CoinGecko not configured");
    if (Date.now() < this.nextAllowedAt) throw new RateLimitError("CoinGecko backing off");
    // deduplicate concurrent identical requests (components never double-fetch)
    const pending = this.inflight.get(path) as Promise<T> | undefined;
    if (pending) return pending;
    const task = this.doGet<T>(path).finally(() => {
      this.inflight.delete(path);
    });
    this.inflight.set(path, task);
    return task;
  }

  private async doGet<T>(path: string): Promise<T> {
    this.state.lastAttempt = Date.now();
    const key = this.keyConfigured ? (process.env.COINGECKO_API_KEY as string).trim() : null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(`${this.base}${path}`, {
        headers: {
          accept: "application/json",
          "user-agent": SYNC_CONFIG.userAgent,
          // Demo plan keys authenticate via x-cg-demo-api-key on the public
          // base; Pro plan keys authenticate via x-cg-pro-api-key on the
          // pro-api base (https://pro-api.coingecko.com/api/v3). The header
          // follows the configured endpoint — the key itself is never logged
          // and never leaves the server.
          ...(key
            ? this.base.includes("pro-api.coingecko.com")
              ? { "x-cg-pro-api-key": key }
              : { "x-cg-demo-api-key": key }
            : {}),
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) {
        // honor Retry-After when the provider sends one, else exponential backoff
        const retryAfter = Number(res.headers.get("retry-after"));
        this.state.ok = false;
        this.state.consecutiveFailures += 1;
        this.state.lastError = `HTTP ${res.status}`;
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(SYNC_CONFIG.maxBackoffMs, 15_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
        this.nextAllowedAt = Date.now() + delay + jitter(1000);
        throw new RateLimitError(`HTTP ${res.status}`);
      }
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
      if (!(err instanceof RateLimitError)) {
        const delay = Math.min(
          SYNC_CONFIG.maxBackoffMs,
          15_000 * 2 ** Math.min(this.state.consecutiveFailures, 5),
        );
        this.nextAllowedAt = Date.now() + delay + jitter(1000);
      }
      throw err;
    }
  }

  /** One page (up to 250 rows) of a category, ordered by market cap. */
  async categoryPage(category: string, page: number, sparkline: boolean): Promise<CgMarketRow[]> {
    const raw = await this.get<CgMarketRow[]>(
      `/coins/markets?vs_currency=usd&category=${encodeURIComponent(category)}&per_page=250&page=${page}&sparkline=${sparkline ? "true" : "false"}&price_change_percentage=24h&precision=full`,
    );
    return Array.isArray(raw) ? raw : [];
  }
}
