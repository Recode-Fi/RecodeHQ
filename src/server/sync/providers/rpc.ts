import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { errorMessage, jitter } from "../util";

export class SkipError extends Error {}
export class RateLimitError extends Error {}

/** Canonical ERC-20 Transfer event topic0. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
};

export function hexToBigInt(hex: string): bigint | null {
  try {
    if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) return null;
    return BigInt(hex === "0x" ? "0x0" : hex);
  } catch {
    return null;
  }
}

/** Decodes an eth_call string return: either ABI-encoded string or bytes32. */
export function decodeAbiString(data: string): string | null {
  if (typeof data !== "string" || !data.startsWith("0x")) return null;
  const body = data.slice(2);
  if (body.length < 64) return null;
  const offset = hexToBigInt(`0x${body.slice(0, 64)}`);
  if (offset != null && offset === BigInt(32) && body.length >= 128) {
    const len = hexToBigInt(`0x${body.slice(64, 128)}`);
    if (len != null) {
      const bytes = body.slice(128, 128 + Number(len) * 2);
      try {
        const text = Buffer.from(bytes, "hex").toString("utf8").replace(/\u0000+$/g, "");
        return text.trim() ? text : null;
      } catch {
        return null;
      }
    }
  }
  const text = Buffer.from(body.slice(0, 64), "hex").toString("utf8").replace(/\u0000+$/g, "");
  return text.trim() ? text : null;
}

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
}

export interface RawTransferLog {
  txHash: string;
  logIndex: number | null;
  from: string;
  to: string;
  valueRaw: string;
}

/**
 * EVM JSON-RPC provider with exponential backoff + rate-limit handling.
 * Used for verifiable on-chain facts: token metadata, blocks, Transfer logs.
 */
export class RpcProvider {
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

  private async post<T>(method: string, params: unknown[]): Promise<T> {
    if (!this.url) throw new SkipError("RPC not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("RPC backing off");
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() % 1_000_000_000, method, params }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) throw new RateLimitError(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message ?? "RPC error");
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return json.result as T;
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

  async chainId(): Promise<string | null> {
    try {
      return await this.post<string>("eth_chainId", []);
    } catch {
      return null;
    }
  }

  async latestBlock(): Promise<number | null> {
    try {
      const hex = await this.post<string>("eth_blockNumber", []);
      const n = hexToBigInt(hex);
      return n == null ? null : Number(n);
    } catch {
      return null;
    }
  }

  private async ethCall(to: string, data: string): Promise<string | null> {
    try {
      return await this.post<string>("eth_call", [{ to, data }, "latest"]);
    } catch {
      return null;
    }
  }

  /** Verifiable on-chain ERC-20 metadata via eth_call. */
  async tokenMetadata(address: string): Promise<TokenMetadata | null> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.ethCall(address, SELECTORS.name),
      this.ethCall(address, SELECTORS.symbol),
      this.ethCall(address, SELECTORS.decimals),
      this.ethCall(address, SELECTORS.totalSupply),
    ]);
    if (name == null && symbol == null && decimals == null && totalSupply == null) return null;
    const dec = decimals ? hexToBigInt(decimals) : null;
    return {
      name: name ? decodeAbiString(name) : null,
      symbol: symbol ? decodeAbiString(symbol) : null,
      decimals: dec != null && dec <= BigInt(64) ? Number(dec) : null,
      totalSupply: totalSupply ?? null,
    };
  }

  async transferLogs(
    address: string,
    fromBlock: number,
    toBlock: number,
  ): Promise<RawTransferLog[] | null> {
    try {
      const logs = await this.post<
        { transactionHash: string; logIndex?: string; topics: string[]; data: string }[]
      >("eth_getLogs", [
        {
          address,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: [TRANSFER_TOPIC],
        },
      ]);
      return logs
        .filter((l) => Array.isArray(l.topics) && l.topics.length >= 3)
        .map((l) => {
          const from = `0x${l.topics[1].slice(26)}`;
          const to = `0x${l.topics[2].slice(26)}`;
          const li = l.logIndex ? Number(hexToBigInt(l.logIndex)) : null;
          return {
            txHash: l.transactionHash,
            logIndex: li != null && Number.isFinite(li) ? li : null,
            from,
            to,
            valueRaw: l.data,
          };
        });
    } catch {
      return null;
    }
  }
}