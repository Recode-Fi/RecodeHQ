import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asFiniteNumber, errorMessage, jitter } from "../util";
import { SkipError } from "./rpc";

export interface YahooMarketCap {
  symbol: string;
  marketCap: number | null;
  source: string;
}

/**
 * Yahoo Finance quoteSummary provider (keyless cookie+crumb bootstrap).
 * Supplies the UNDERLYING security's market capitalization (companies and,
 * where Yahoo exposes it, funds). Tolerant parsing Ã¢â‚¬â€ only validated numbers.
 */
export class YahooProvider {
  readonly state: ProviderState;
  private nextAllowedAt = 0;
  private cookie: string | null = null;
  private crumb: string | null = null;
  private crumbAt = 0;

  constructor(
    public readonly url: string | null,
    private readonly seedUrl: string | null,
    private readonly crumbUrl: string | null,
  ) {
    this.state = {
      configured: Boolean(url),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  private async raw(path: string, timeoutMs = SYNC_CONFIG.requestTimeoutMs): Promise<{ status: number; body: string; setCookies: string[] }> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": SYNC_CONFIG.userAgent,
    };
    if (this.cookie) headers.cookie = this.cookie;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.url}${path}`, {
        headers,
        signal: ctrl.signal,
        cache: "no-store",
      });
      const setCookies =
        typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const body = await res.text();
      clearTimeout(timer);
      return { status: res.status, body, setCookies };
    } finally {
      clearTimeout(timer);
    }
  }

  private storeCookies(setCookies: string[]): void {
    if (setCookies.length === 0) return;
    const jar = new Map<string, string>();
    if (this.cookie) {
      for (const part of this.cookie.split("; ")) {
        const i = part.indexOf("=");
        if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
      }
    }
    for (const sc of setCookies) {
      const first = sc.split(";")[0];
      const i = first.indexOf("=");
      if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
    }
    this.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async ensureCrumb(): Promise<string> {
    if (this.crumb && Date.now() - this.crumbAt < 30 * 60_000) return this.crumb;
    if (!this.seedUrl || !this.crumbUrl) throw new SkipError("Yahoo bootstrap not configured");
    try {
      await this.raw("", 10_000);
    } catch {
      /* seed only exists to set cookies */
    }
    this.cookie = null;
    const crumbRes = await this.raw("/v1/test/getcrumb", 15_000);
    if (crumbRes.status !== 200) throw new Error(`crumb HTTP ${crumbRes.status}`);
    if (crumbRes.setCookies.length > 0) {
      // re-seed cookies if the crumb response refreshed them
      this.cookie = crumbRes.setCookies
        .map((sc) => sc.split(";")[0])
        .join("; ");
    }
    const crumb = crumbRes.body.trim();
    if (!crumb || crumb.length > 40) throw new Error("invalid crumb");
    this.crumb = crumb;
    this.crumbAt = Date.now();
    return crumb;
  }

  private async guarded<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.url) throw new SkipError("Yahoo not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Yahoo backing off");
    this.state.lastAttempt = Date.now();
    try {
      const result = await fn();
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return result;
    } catch (err) {
      this.state.ok = false;
      this.state.lastError = errorMessage(err);
      /* SkipError = a specific endpoint is deterministically unavailable
         (e.g. quoteSummary 401) — that must NOT back off the whole provider,
         or other healthy endpoints (chart) are silently starved. Only real
         failures/consecutive errors escalate the provider-wide backoff. */
      if (err instanceof SkipError) {
        throw err;
      }
      this.state.consecutiveFailures += 1;
      const delay = Math.min(
        SYNC_CONFIG.maxBackoffMs,
        5_000 * 2 ** Math.min(this.state.consecutiveFailures, 6),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(400);
      throw err;
    }
  }

  /** Underlying security market cap (equities; funds may return null Ã¢â‚¬â€ honest). */
  async quoteSummary(symbol: string): Promise<YahooMarketCap | null> {
    return this.guarded(async () => {
      const crumb = await this.ensureCrumb();
      const res = await this.raw(
        `/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail&crumb=${encodeURIComponent(crumb)}`,
        20_000,
      );
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new SkipError(`Yahoo quoteSummary ${res.status} for ${symbol}`);
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(res.body) as {
        quoteSummary?: {
          result?: { summaryDetail?: { marketCap?: { raw?: unknown } } }[];
          error?: unknown;
        };
      };
      const result0 = json.quoteSummary?.result?.[0];
      const raw = result0?.summaryDetail?.marketCap?.raw;
      const marketCap = asFiniteNumber(raw);
      if (marketCap == null || marketCap <= 0) return { symbol, marketCap: null, source: "Yahoo Finance" };
      return { symbol, marketCap, source: "Yahoo Finance" };
    });
  }

  /**
   * Underlying company classification metadata (sector + industry) from the
   * provider's assetProfile module. Primary source for RECODE's sector
   * taxonomy â€” provider values are normalized in src/lib/classification.ts.
   */
  async assetProfile(symbol: string): Promise<{ sector: string | null; industry: string | null } | null> {
    return this.guarded(async () => {
      const crumb = await this.ensureCrumb();
      const res = await this.raw(
        `/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`,
        20_000,
      );
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new SkipError(`Yahoo assetProfile ${res.status} for ${symbol}`);
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(res.body) as {
        quoteSummary?: {
          result?: {
            assetProfile?: { sector?: unknown; industry?: unknown };
          }[];
          error?: unknown;
        };
      };
      const profile = json.quoteSummary?.result?.[0]?.assetProfile;
      const sector = typeof profile?.sector === "string" && profile.sector.trim() ? profile.sector.trim() : null;
      const industry =
        typeof profile?.industry === "string" && profile.industry.trim() ? profile.industry.trim() : null;
      if (!sector && !industry) return null;
      return { sector, industry };
    });
  }

  /**
   * Verified historical OHLCV candles for the UNDERLYING security (Yahoo v8
   * chart API - keyless, no crumb). This is the tokenized asset's real
   * historical market record: the token tracks its underlying 1:1, so its
   * implied historical price = underlying close x corporate-action multiplier
   * (applied by the caller). Buckets with missing provider values are skipped
   * - no candles are invented.
   */
  async chart(
    symbol: string,
    range: string,
    interval: string,
  ): Promise<{
    candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[];
    previousClose: number | null;
    price: number | null;
  } | null> {
    return this.guarded(async () => {
      const host = this.url ? this.url.replace(/\/v10.*$/, "") : "https://query1.finance.yahoo.com";
      const url =
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false`;
      // v8 chart is host-rooted (not under /v10) and needs no cookie/crumb,
      // so it fetches the absolute URL directly.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": SYNC_CONFIG.userAgent },
        signal: ctrl.signal,
        cache: "no-store",
      }).finally(() => clearTimeout(timer));
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new SkipError(`Yahoo chart ${res.status} for ${symbol}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawBody = await res.text();
      const json = JSON.parse(rawBody) as {
        chart?: {
          result?: {
            meta?: { chartPreviousClose?: unknown; regularMarketPrice?: unknown };
            timestamp?: unknown;
            indicators?: {
              quote?: {
                open?: unknown;
                high?: unknown;
                low?: unknown;
                close?: unknown;
                volume?: unknown;
              }[];
            };
          }[];
          error?: unknown;
        };
      };
      const result0 = json.chart?.result?.[0];
      const ts = Array.isArray(result0?.timestamp) ? (result0.timestamp as number[]) : null;
      const q = result0?.indicators?.quote?.[0];
      if (!ts || ts.length === 0 || !Array.isArray(q?.close)) return null;
      const open = Array.isArray(q.open) ? (q.open as unknown[]) : [];
      const high = Array.isArray(q.high) ? (q.high as unknown[]) : [];
      const low = Array.isArray(q.low) ? (q.low as unknown[]) : [];
      const close = q.close as unknown[];
      const volume = Array.isArray(q.volume) ? (q.volume as unknown[]) : [];
      const candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[] = [];
      for (let i = 0; i < ts.length; i++) {
        const t = (ts[i] as number) * 1000;
        const c = asFiniteNumber(close[i]);
        if (c == null || c <= 0) continue;
        const o = asFiniteNumber(open[i]);
        const h = asFiniteNumber(high[i]);
        const l = asFiniteNumber(low[i]);
        const v = asFiniteNumber(volume[i]);
        candles.push({
          t,
          o: o != null && o > 0 ? o : c,
          h: h != null && h > 0 ? h : c,
          l: l != null && l > 0 ? l : c,
          c,
          v: v != null && v >= 0 ? v : null,
        });
      }
      const previousClose = asFiniteNumber(result0?.meta?.chartPreviousClose);
      const price = asFiniteNumber(result0?.meta?.regularMarketPrice);
      return { candles, previousClose, price };
    });
  }
}

