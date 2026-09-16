import { ARC_CHAIN, ARC_CONFIG } from "../config";

/**
 * ============================================================
 * ARC — EVM JSON-RPC provider (reuses the EVM address family)
 * ============================================================
 * Standard eth_* JSON-RPC against the official Arc endpoint.
 * Arc-specific semantics handled here (per official docs):
 *   - eth_getBalance returns NATIVE USDC in 18 decimals →
 *     displayed as USDC by dividing by 1e12 (6-decimal face value).
 *   - ERC-20 calls use the USDC interface at 0x3600…0000 (6 decimals).
 *   - Whale/stablecoin flows come from the EIP-7708 system emitter
 *     Transfer logs (18 decimals) — never mixed with the 6-dec stream.
 * Data integrity: provider failures return null, never 0.
 */

export interface ArcRpcState {
  configured: boolean;
  ok: boolean | null;
  lastAttempt: number | null;
  lastSuccess: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  chainId: number | null;
}

const L = BigInt(1e12); // 1e18 (native wei-USDC) → 1e6 (face-value USDC)

export class ArcRpcProvider {
  readonly state: ArcRpcState;
  private nextAllowedAt = 0;

  constructor(private readonly endpoint: string = ARC_CONFIG.rpcUrl) {
    this.state = {
      configured: Boolean(endpoint),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
      chainId: null,
    };
  }

  get configured(): boolean {
    return Boolean(this.endpoint);
  }

  msUntilAllowed(): number {
    return Math.max(0, this.nextAllowedAt - Date.now());
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T | null> {
    if (!this.endpoint) return null;
    if (Date.now() < this.nextAllowedAt) return null;
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ARC_CONFIG.requestTimeoutMs);
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": ARC_CONFIG.userAgent },
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
      if (!res.ok) throw new Error(`Arc RPC HTTP ${res.status}`);
      const json = (await res.json()) as { error?: { message: string }; result?: T };
      if (json.error) throw new Error(json.error.message ?? "Arc RPC error");
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

  /** Verify the endpoint serves the official Arc mainnet chain id. */
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

  /**
   * Native USDC balance. Arc's native gas token is USDC (18 decimals);
   * returns face-value USDC (6-decimal representation) = wei / 1e12.
   * Null when the RPC fails — never 0.
   */
  async getNativeUsdc(address: string): Promise<number | null> {
    const hex = await this.call<string>("eth_getBalance", [address, "latest"]);
    if (hex == null) return null;
    try {
      return Number(BigInt(hex) / L) / 1e6;
    } catch {
      return null;
    }
  }

  async getDecimals(token: string): Promise<number | null> {
    const hex = await this.call<string>("eth_call", [
      { to: token, data: "0x313ce567" }, // decimals()
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
      return Number(BigInt(hex) / BigInt("1" + "0".repeat(dec)));
    } catch {
      return null;
    }
  }

  async getSymbol(token: string): Promise<string | null> {
    const hex = await this.call<string>("eth_call", [
      { to: token, data: "0x95d89b41" }, // symbol()
      "latest",
    ]);
    return decodeString(hex);
  }

  async getName(token: string): Promise<string | null> {
    const hex = await this.call<string>("eth_call", [
      { to: token, data: "0x06fdde03" }, // name()
      "latest",
    ]);
    return decodeString(hex);
  }

  async getCode(address: string): Promise<string | null> {
    return this.call<string>("eth_getCode", [address, "latest"]);
  }

  /**
   * Native-USDC Transfer logs (EIP-7708 system emitter, 18 decimals) in a
   * block window. Values are converted to face-value USDC (÷1e12).
   */
  async getUsdcTransfers(
    fromBlock: number,
    toBlock: number,
    address?: string,
  ): Promise<ArcTransferLog[] | null> {
    const params: Record<string, unknown> = {
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      address: ARC_CHAIN.usdcSystemEmitter,
      topics: address
        ? [ARC_CHAIN.transferTopic0, null, padTopic(address)]
        : [ARC_CHAIN.transferTopic0],
    };
    const logs = await this.call<ArcRawLog[]>("eth_getLogs", [params]);
    if (logs == null) return null;
    const out: ArcTransferLog[] = [];
    for (const log of logs) {
      try {
        const value = BigInt(log.data);
        out.push({
          from: topicToAddress(log.topics?.[1]),
          to: topicToAddress(log.topics?.[2]),
          /** System-emitter logs are 18 decimals → face-value USDC. */
          amountUsdc: Number(value / L) / 1e6,
          txHash: log.transactionHash,
          blockNumber: Number.parseInt(log.blockNumber, 16),
        });
      } catch {
        /* malformed log skipped — never guessed */
      }
    }
    return out;
  }

  async getBlockTimestamp(blockNumber: number): Promise<number | null> {
    const block = await this.call<{ timestamp: string }>("eth_getBlockByNumber", [
      `0x${blockNumber.toString(16)}`,
      false,
    ]);
    if (!block?.timestamp) return null;
    try {
      return Number(BigInt(block.timestamp)) * 1000;
    } catch {
      return null;
    }
  }
}

export interface ArcTransferLog {
  from: string | null;
  to: string | null;
  amountUsdc: number;
  txHash: string;
  blockNumber: number;
}

interface ArcRawLog {
  address: string;
  topics?: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

function padTopic(address: string): string {
  return `0x${address.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

function topicToAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 42) return null;
  return `0x${topic.slice(-40)}`;
}

/**
 * Decode an ABI-encoded dynamic string return value.
 * Standard layout: [offset word][… at offset: length word][data …].
 */
function decodeString(hex: string | null): string | null {
  if (!hex || !hex.startsWith("0x") || hex.length < 130) return null;
  try {
    const body = hex.slice(2);
    const word0 = BigInt(`0x${body.slice(0, 64)}`);
    // Dynamic returns carry an offset (0x20) in the first word; some
    // minimal encoders put the length directly in the first word.
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