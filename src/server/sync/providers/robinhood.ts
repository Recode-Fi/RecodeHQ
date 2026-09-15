import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asFiniteNumber, asNonEmptyString, asEvmAddress, errorMessage, jitter } from "../util";
import { RateLimitError, SkipError } from "./rpc";

export interface RhjAsset {
  address: string;
  symbol: string;
  name: string | null;
  status: string | null;
  multiplier: number | null;
  logoUrl: string | null;
  decimals: number | null;
  /** Official per-asset trading capabilities (e.g. day / extended / overnight). */
  tradingCapabilities: string[] | null;
}

export interface RhjPrice {
  symbol: string;
  /** Contract address of the deployment the quote refers to (chain-validated). */
  address: string | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  volume24h: number | null;
  /** Underlying daily high/low as reported by the API. */
  high24h: number | null;
  low24h: number | null;
  halted: boolean | null;
  timestamp: number | null;
}

/** Quote shape including per-asset capabilities passthrough. */
export interface RhjQuote extends RhjPrice {
  tradingCapabilities: string[] | null;
}

/** Tolerant array extraction from the various documented/wrapper response shapes. */
export function extractItems(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    for (const key of ["results", "assets", "items", "data", "tokens", "quotes"]) {
      const v = (json as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** Normalizes an official /rhj/assets response. Invalid rows are skipped, never guessed. */
export function parseRhjAssets(json: unknown): RhjAsset[] {
  const out: RhjAsset[] = [];
  for (const item of extractItems(json)) {
    const rec = item as Record<string, unknown>;
    const address = asNonEmptyString(
      rec.contract_address ?? rec.contractAddress ?? rec.address ?? rec.address_hash,
    );
    const symbol = asNonEmptyString(rec.tokenSymbol ?? rec.symbol);
    if (!address || !symbol) continue;
    // tradingCapabilities: tolerate array-of-strings or array-of-objects with a name/key.
    const rawCaps = rec.tradingCapabilities ?? rec.trading_capabilities;
    let capabilities: string[] | null = null;
    if (Array.isArray(rawCaps)) {
      const caps = rawCaps
        .map((c) =>
          typeof c === "string"
            ? c
            : c && typeof c === "object"
              ? asNonEmptyString(
                  (c as Record<string, unknown>).name ??
                    (c as Record<string, unknown>).capability ??
                    (c as Record<string, unknown>).type ??
                    (c as Record<string, unknown>).key,
                )
              : null,
        )
        .filter((c): c is string => c != null);
      capabilities = capsOf(caps);
    }
    out.push({
      address: address.toLowerCase(),
      symbol,
      name: asNonEmptyString(rec.name ?? rec.tokenName),
      status: asNonEmptyString(rec.status ?? rec.asset_status),
      multiplier: asFiniteNumber(rec.corporate_action_multiplier ?? rec.currentMultiplier ?? rec.multiplier),
      logoUrl: asNonEmptyString(rec.logo ?? rec.logoUrl ?? rec.logo_url ?? rec.icon_url),
      decimals: asFiniteNumber(rec.decimals),
      tradingCapabilities: capabilities,
    });
  }
  return out;
}

function capsOf(caplets: string[]): string[] | null {
  return caplets.length > 0 ? caplets : null;
}

/**
 * Normalizes a /rhj/prices/{symbol} response. Verified live shape (2026-09):
 * `{ quotes: [{ tokenSymbol, deployments: [{ contractAddress, chainId }],
 *    bid: "218.25", ask: "245.98", currency, dailyTradingVolume,
 *    isTradingHalt, generatedAt, dailyHigh, dailyLow, ... }] }` — numeric
 * fields arrive as decimal strings. The quote deployed on `chainId` is
 * preferred (chainId + contractAddress is the canonical asset identity).
 */
export function parseRhjQuote(
  json: unknown,
  chainId: number,
): RhjQuote | null {
  const items = extractItems(json);
  if (items.length === 0) return null;
  let rec: Record<string, unknown> | null = null;
  let matchedAddress: string | null = null;
  for (const item of items) {
    const q = item as Record<string, unknown>;
    if (Array.isArray(q.deployments)) {
      for (const dep of q.deployments) {
        const d = dep as Record<string, unknown>;
        const addr = asEvmAddress(d.contract_address ?? d.contractAddress);
        if (!addr) continue;
        const onChain = asFiniteNumber(d.chainId) === chainId;
        if (onChain || rec == null) {
          rec = q;
          matchedAddress = addr;
        }
        if (onChain) break;
      }
      if (rec === q && matchedAddress) break;
    } else if (rec == null) {
      rec = q;
    }
  }
  if (!rec) return null;
  const bid = asFiniteNumber(rec.bid ?? rec.bid_price);
  const ask = asFiniteNumber(rec.ask ?? rec.ask_price);
  const high24h = asFiniteNumber(rec.dailyHigh ?? rec.high_24h ?? rec.high);
  const low24h = asFiniteNumber(rec.dailyLow ?? rec.low_24h ?? rec.low);
  const volume24h = asFiniteNumber(
    rec.dailyTradingVolume ??
      rec.daily_volume ??
      rec.volume_24h ??
      rec.volume ??
      rec.daily_trading_volume,
  );
  const halted =
    typeof rec.isTradingHalt === "boolean"
      ? rec.isTradingHalt
      : typeof rec.trading_halt === "boolean"
        ? rec.trading_halt
        : null;
  const tsRaw = asNonEmptyString(rec.generatedAt ?? rec.generated_timestamp ?? rec.generated_at ?? rec.timestamp);
  const parsedTs = tsRaw ? Date.parse(tsRaw.replace(/(\.\d{3})\d+/, "$1")) : null;
  const mid = bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask);
  if (mid == null && volume24h == null) return null;
  return {
    symbol: asNonEmptyString(rec.tokenSymbol ?? rec.symbol) ?? "",
    address: matchedAddress,
    bid,
    ask,
    mid,
    volume24h,
    high24h,
    low24h,
    halted,
    tradingCapabilities: null,
    timestamp: parsedTs != null && Number.isFinite(parsedTs) ? parsedTs : null,
  };
}

/**
 * Official Robinhood Stock Token API provider (/rhj/assets, /rhj/prices/{symbol}).
 * Tolerant parsing: only validated fields enter the store, so an unexpected
 * response shape degrades to "no data" instead of wrong data. When the API is
 * unreachable from the host network, the provider reports unavailable and the
 * engine keeps running on its other verified sources.
 */
export class RobinhoodStockTokenProvider {
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
    if (!this.url) throw new SkipError("Robinhood API not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Robinhood API backing off");
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
        5_000 * 2 ** Math.min(this.state.consecutiveFailures, 6),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(500);
      throw err;
    }
  }

  private static extractItems(json: unknown): Record<string, unknown>[] {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
      for (const key of ["results", "assets", "items", "data", "tokens", "quotes"]) {
        const v = (json as Record<string, unknown>)[key];
        if (Array.isArray(v)) return v;
      }
    }
    return [];
  }

  /** Official asset registry: symbol, name, contract, status, multiplier, logo. */
  async assets(): Promise<RhjAsset[] | null> {
    try {
      const json = await this.get<unknown>("/assets");
      const out = parseRhjAssets(json);
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  /**
   * Official price quote. Parsing/normalization lives in the pure,
   * unit-tested `parseRhjQuote` — this method only performs the HTTP fetch.
   */
  async price(symbol: string): Promise<RhjPrice | null> {
    try {
      const json = await this.get<unknown>(`/prices/${encodeURIComponent(symbol)}`);
      return parseRhjQuote(json, SYNC_CONFIG.chainId);
    } catch {
      return null;
    }
  }

  /** Official Robinhood fundamentals: underlying market cap, prev close, volume. */
  async fundamentals(
    symbol: string,
  ): Promise<{ marketCap: number | null; previousClose: number | null; volume: number | null } | null> {
    try {
      const json = await this.get<Record<string, unknown>>(
        `/fundamentals/${encodeURIComponent(symbol)}`,
      );
      const rec = Array.isArray(json)
        ? (json[0] as Record<string, unknown>)
        : (json as Record<string, unknown>);
      if (!rec || typeof rec !== "object") return null;
      const marketCap = asFiniteNumber(rec.market_cap);
      const previousClose = asFiniteNumber(rec.previous_close);
      const volume = asFiniteNumber(rec.volume);
      if (marketCap == null && previousClose == null && volume == null) return null;
      return { marketCap, previousClose, volume };
    } catch {
      return null;
    }
  }
}