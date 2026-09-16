import type { EvmChainConfig } from "../types";

/**
 * ============================================================
 * EVM NET — generic EVM JSON-RPC provider (chain-parameterized)
 * ============================================================
 * Standard eth_* JSON-RPC; balance is the native token (18 decimals).
 * Whale/stablecoin flows read ERC-20 Transfer logs from the chain's
 * configured canonical-stablecoin emitter (verified per chain in
 * config.ts). Failures return null — never 0, never another chain.
 */

export interface EvmNetRpcState {
  configured: boolean;
  ok: boolean | null;
  lastAttempt: number | null;
  lastSuccess: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  chainId: number | null;
}

export const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface EvmTransferLog {
  from: string | null;
  to: string | null;
  amount: number;
  txHash: string;
  blockNumber: number;
}

interface EvmRawLog {
  address: string;
  topics?: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export class EvmNetRpcProvider {
  readonly state: EvmNetRpcState;
  private nextAllowedAt = 0;

  constructor(
    private readonly cfg: EvmChainConfig,
    private readonly timeoutMs: number,
    private readonly userAgent: string,
  ) {
    this.state = {
      configured: Boolean(cfg.rpcUrl),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
      chainId: null,
    };
  }

  get configured(): boolean {
    return Boolean(this.cfg.rpcUrl);
  }

  msUntilAllowed(): number {
    return Math.max(0, this.nextAllowedAt - Date.now());
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T | null> {
    if (Date.now() < this.nextAllowedAt) return null;
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const res = await fetch(this.cfg.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": this.userAgent },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) {
        this.state.ok = false;
        this.state.lastError = `HTTP ${res.status}`;
        this.nextAllowedAt =
          Date.now() + Math.min(60_000, 3_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
        this.state.consecutiveFailures += 1;
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { error?: { message: string }; result?: T };
      if (json.error) throw new Error(json.error.message ?? "RPC error");
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return json.result ?? null;
    } catch (err) {
      this.state.ok = false;
      this.state.consecutiveFailures += 1;
      this.state.lastError = err instanceof Error ? err.message : "rpc failed";
      if (this.nextAllowedAt === 0) {
        this.nextAllowedAt =
          Date.now() + Math.min(60_000, 3_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
      }
      return null;
    }
  }

  async verifyChain(): Promise<number | null> {
    const hex = await this.call<string>("eth_chainId");
    if (hex == null) return null;
    const id = Number.parseInt(hex, 16);
    this.state.chainId = Number.isFinite(id) ? id : null;
    return this.state.chainId;
  }

  async latestBlock(): Promise<number | null> {
    const hex = await this.call<string>("eth_blockNumber");
    return hex == null ? null : Number.parseInt(hex, 16);
  }

  /** Native token balance (18 decimals → human number). Null on failure. */
  async getNativeBalance(address: string): Promise<number | null> {
    const hex = await this.call<string>("eth_getBalance", [address, "latest"]);
    if (hex == null) return null;
    try {
      return Number(BigInt(hex) / BigInt(1e12)) / 1e6;
    } catch {
      return null;
    }
  }

  async getDecimals(token: string): Promise<number | null> {
    const hex = await this.call<string>("eth_call", [
      { to: token, data: "0x313ce567" },
      "latest",
    ]);
    if (hex == null || hex === "0x") return null;
    try {
      return Number(BigInt(hex));
    } catch {
      return null;
    }
  }

  /** ERC-20 balanceOf → human number using the token's own decimals. */
  async getErc20Balance(token: string, address: string): Promise<number | null> {
    const data = `0x70a08231000000000000000000000000${address.replace(/^0x/i, "").toLowerCase()}`;
    const hex = await this.call<string>("eth_call", [{ to: token, data }, "latest"]);
    if (hex == null || hex === "0x") return null;
    try {
      const dec = (await this.getDecimals(token)) ?? 18;
      return Number(BigInt(hex) / BigInt(`1${"0".repeat(dec)}`));
    } catch {
      return null;
    }
  }

  async getSymbol(token: string): Promise<string | null> {
    return decodeString(
      await this.call<string>("eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]),
    );
  }

  async getName(token: string): Promise<string | null> {
    return decodeString(
      await this.call<string>("eth_call", [{ to: token, data: "0x06fdde03" }, "latest"]),
    );
  }

  async getCode(address: string): Promise<string | null> {
    return this.call<string>("eth_getCode", [address, "latest"]);
  }

  /**
   * Stablecoin Transfer logs in a block window, optionally limited to
   * one wallet (two precise orientations: wallet-as-from, wallet-as-to).
   * Values converted with the emitter's configured decimals.
   */
  async getStablecoinTransfers(
    fromBlock: number,
    toBlock: number,
    address?: string,
  ): Promise<EvmTransferLog[] | null> {
    const range = {
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      address: this.cfg.whaleEmitter,
    };
    const divisor = BigInt(`1${"0".repeat(Math.max(0, this.cfg.whaleDecimals))}`);
    const parse = (logs: EvmRawLog[] | null): EvmTransferLog[] | null => {
      if (logs == null) return null;
      const out: EvmTransferLog[] = [];
      for (const log of logs) {
        try {
          out.push({
            from: topicToAddress(log.topics?.[1]),
            to: topicToAddress(log.topics?.[2]),
            amount: Number(BigInt(log.data) / divisor),
            txHash: log.transactionHash,
            blockNumber: Number.parseInt(log.blockNumber, 16),
          });
        } catch {
          /* malformed log skipped */
        }
      }
      return out;
    };
    if (!address) {
      const logs = await this.call<EvmRawLog[]>("eth_getLogs", [
        { ...range, topics: [TRANSFER_TOPIC0] },
      ]);
      return parse(logs);
    }
    const addr = padTopic(address);
    // Two precise orientations (from-wallet, to-wallet) — both must
    // succeed for a complete window; a single failure degrades honestly.
    const outLogs = await this.call<EvmRawLog[]>("eth_getLogs", [
      { ...range, topics: [TRANSFER_TOPIC0, addr] },
    ]);
    if (outLogs == null) return null;
    const inLogs = await this.call<EvmRawLog[]>("eth_getLogs", [
      { ...range, topics: [TRANSFER_TOPIC0, null, addr] },
    ]);
    if (inLogs == null) return null;
    return [...parse(outLogs)!, ...parse(inLogs)!];
  }
}

function padTopic(address: string): string {
  return `0x${address.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 42) return null;
  return `0x${topic.slice(-40)}`;
}

/** Decode an ABI-encoded dynamic string return value. */
function decodeString(hex: string | null): string | null {
  if (!hex || !hex.startsWith("0x") || hex.length < 130) return null;
  try {
    const body = hex.slice(2);
    const word0 = BigInt(`0x${body.slice(0, 64)}`);
    const lenAt = word0 > BigInt(64) ? Number(word0) * 2 : 64;
    const len = Number(BigInt(`0x${body.slice(lenAt, lenAt + 64)}`));
    if (!Number.isFinite(len) || len <= 0 || len > 256) return null;
    const raw = body.slice(lenAt + 64, lenAt + 64 + len * 2);
    const bytes = new Uint8Array(raw.match(/.{1,2}/g)?.map((b) => Number.parseInt(b, 16)) ?? []);
    const text = new TextDecoder().decode(bytes);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}