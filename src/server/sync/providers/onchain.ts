import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { errorMessage, jitter } from "../util";
import { RateLimitError, SkipError, hexToBigInt } from "./rpc";

const SELECTOR_BALANCE_OF = "0x70a08231";
const SELECTOR_OWNER = "0x8da5cb5b";
const SELECTOR_SUPPORTS_INTERFACE = "0x01ffc9a7";

/**
 * Low-level EVM JSON-RPC client for user-facing on-chain reads (wallet
 * balances, contract facts). Independent of the sync engine's RpcProvider
 * so engine syncing is never blocked by interactive requests.
 */
export class OnchainProvider {
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
        1_500 * 2 ** Math.min(this.state.consecutiveFailures, 5),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(200);
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

  async nativeBalanceWei(address: string): Promise<bigint | null> {
    try {
      const hex = await this.post<string>("eth_getBalance", [address, "latest"]);
      return hexToBigInt(hex);
    } catch {
      return null;
    }
  }

  async call(to: string, data: string): Promise<string | null> {
    try {
      return await this.post<string>("eth_call", [{ to, data }, "latest"]);
    } catch {
      return null;
    }
  }

  async balanceOfRaw(token: string, holder: string): Promise<bigint | null> {
    const padded = holder.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
    const out = await this.call(token, `${SELECTOR_BALANCE_OF}${padded}`);
    return out ? hexToBigInt(out) : null;
  }

  async ownerOf(address: string): Promise<string | null> {
    const out = await this.call(address, SELECTOR_OWNER);
    if (!out) return null;
    const n = hexToBigInt(out);
    if (n == null || n === BigInt(0)) return null;
    return `0x${n.toString(16).padStart(40, "0")}`;
  }

  async codeInfo(address: string): Promise<{ isContract: boolean; sizeBytes: number | null } | null> {
    try {
      const code = await this.post<string>("eth_getCode", [address, "latest"]);
      if (typeof code !== "string") return null;
      const size = code.length > 2 ? (code.length - 2) / 2 : 0;
      return { isContract: size > 0, sizeBytes: size };
    } catch {
      return null;
    }
  }

  async txCount(address: string): Promise<number | null> {
    try {
      const hex = await this.post<string>("eth_getTransactionCount", [address, "latest"]);
      const n = hexToBigInt(hex);
      return n == null ? null : Number(n);
    } catch {
      return null;
    }
  }

  async blockNumber(): Promise<number | null> {
    try {
      const hex = await this.post<string>("eth_blockNumber", []);
      const n = hexToBigInt(hex);
      return n == null ? null : Number(n);
    } catch {
      return null;
    }
  }

  /** Live gas price in wei (eth_gasPrice). */
  async gasPriceWei(): Promise<bigint | null> {
    try {
      const hex = await this.post<string>("eth_gasPrice", []);
      return hexToBigInt(hex);
    } catch {
      return null;
    }
  }

  /** Block header with timestamp — powers the live network status strip. */
  async blockByNumber(
    n: number,
  ): Promise<{ number: number; timestamp: number } | null> {
    try {
      const raw = await this.post<{ number?: string; timestamp?: string } | null>(
        "eth_getBlockByNumber",
        [`0x${n.toString(16)}`, false],
      );
      if (!raw?.number || !raw?.timestamp) return null;
      const num = hexToBigInt(raw.number);
      const ts = hexToBigInt(raw.timestamp);
      if (num == null || ts == null) return null;
      return { number: Number(num), timestamp: Number(ts) * 1_000 };
    } catch {
      return null;
    }
  }

  /** Full runtime bytecode — powers capability (selector) detection. */
  async bytecode(address: string): Promise<string | null> {
    try {
      const code = await this.post<string>("eth_getCode", [address, "latest"]);
      return typeof code === "string" && code.length > 2 ? code : null;
    } catch {
      return null;
    }
  }

  async getStorageAt(address: string, slot: string): Promise<string | null> {
    try {
      return await this.post<string>("eth_getStorageAt", [address, slot, "latest"]);
    } catch {
      return null;
    }
  }

  /** Capped recent logs — used for measured recent-transfer activity. */
  async getLogs(
    address: string,
    topic0: string,
    fromBlock: number,
    toBlock: number,
  ): Promise<{ blockNumber: number }[] | null> {
    try {
      const out = await this.post<{ blockNumber?: string }[]>("eth_getLogs", [
        { address, topics: [topic0], fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}` },
      ]);
      if (!Array.isArray(out)) return null;
      return out.slice(0, 10_000).map((l) => ({
        blockNumber: l?.blockNumber ? Number(BigInt(l.blockNumber)) : 0,
      }));
    } catch {
      return null;
    }
  }

  async supportsInterface(address: string, interfaceId: string): Promise<boolean | null> {
    const out = await this.call(address, `${SELECTOR_SUPPORTS_INTERFACE}${interfaceId.replace(/^0x/i, "").padStart(8, "0")}${"0".repeat(56)}`);
    const n = out ? hexToBigInt(out) : null;
    return n == null ? null : n !== BigInt(0);
  }
}

/* ---------- ABI decode helpers (exported for the contract scanner) ---------- */

/** Decodes an ABI-encoded dynamic string return value (offset/len/data). */
export function decodeAbiString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  try {
    const data = hex.slice(2);
    if (data.length < 128) return null;
    const len = parseInt(data.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0 || len > 8192 || data.length < 128 + len * 2) return null;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = parseInt(data.slice(128 + i * 2, 130 + i * 2), 16);
    }
    const out = new TextDecoder().decode(bytes).replace(/\u0000+$/, "").trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Decodes a 32-byte word as uint (bigint), rejecting empty/error returns. */
export function decodeAbiUint(hex: string | null): bigint | null {
  if (!hex || hex.length < 3 || hex === "0x") return null;
  try {
    const n = BigInt(hex);
    return n >= BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

/** Extracts the address encoded in the low 20 bytes of a 32-byte word. */
export function decodeAbiAddress(word: string | null): string | null {
  const n = decodeAbiUint(word);
  if (n == null) return null;
  const hex = n.toString(16).padStart(64, "0");
  const addr = `0x${hex.slice(24)}`;
  return /^0x[0-9a-f]{40}$/.test(addr) && BigInt(`0x${hex.slice(24)}`) !== BigInt(0) ? addr : null;
}
