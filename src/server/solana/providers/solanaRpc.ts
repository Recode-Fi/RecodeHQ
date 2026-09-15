import { SOLANA_CONFIG } from "../config";
import type { SolanaProviderState } from "../types";

/**
 * ============================================================
 * SOLANA — JSON-RPC provider (mainnet-beta, read-only)
 * ============================================================
 * Thin client over Solana JSON-RPC 2.0 for on-chain facts the
 * market-data provider cannot give: native SOL balance, SPL token
 * accounts, largest token accounts (holder concentration), token
 * supply and recent signature activity. 429s back off so the
 * public endpoint is never hammered; every method returns null
 * on failure — the caller decides how "unavailable" renders.
 */

export interface RpcTokenAmount {
  uiAmount: number | null;
  decimals: number | null;
  amount: string;
}

export interface RpcParsedTokenAccount {
  /** SPL token account address. */
  address: string;
  mint: string;
  owner: string;
  amount: RpcTokenAmount;
}

export interface RpcLargestAccount {
  /** SPL token account address. */
  address: string;
  amount: RpcTokenAmount;
  /** Owner wallet when resolved via getMultipleAccounts (null otherwise). */
  owner: string | null;
}

export interface RpcSignature {
  signature: string;
  /** Block time in ms (null when not yet confirmed into a block). */
  blockTime: number | null;
  err: unknown | null;
}

const SOL_LAMPORTS = 1_000_000_000;

export class SolanaRpcProvider {
  readonly state: SolanaProviderState;
  private nextAllowedAt = 0;

  constructor(private readonly endpoint: string = SOLANA_CONFIG.rpcUrl) {
    this.state = {
      configured: Boolean(endpoint),
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  get configured(): boolean {
    return Boolean(this.endpoint);
  }

  /** Low-level JSON-RPC 2.0 call with timeout + 429 backoff. */
  async call<T>(method: string, params: unknown[] = []): Promise<T | null> {
    if (!this.endpoint) return null;
    if (Date.now() < this.nextAllowedAt) return null;
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SOLANA_CONFIG.requestTimeoutMs);
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": SOLANA_CONFIG.userAgent,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 503) {
        this.state.ok = false;
        this.state.lastError = `HTTP ${res.status}`;
        this.nextAllowedAt =
          Date.now() +
          Math.min(120_000, 5_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
        this.state.consecutiveFailures += 1;
        return null;
      }
      if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
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
          Date.now() +
          Math.min(120_000, 5_000 * 2 ** Math.min(this.state.consecutiveFailures, 5));
      }
      return null;
    }
  }

  /** Native SOL balance in whole SOL (null = unavailable). */
  async getSolBalance(address: string): Promise<number | null> {
    const r = await this.call<{ value: number }>("getBalance", [address]);
    return r?.value != null ? r.value / SOL_LAMPORTS : null;
  }

  /** SPL token accounts of a wallet (jsonParsed). */
  async getTokenAccounts(address: string): Promise<RpcParsedTokenAccount[]> {
    const r = await this.call<{
      value: {
        pubkey: string;
        account: {
          data: {
            parsed: {
              info: {
                mint: string;
                owner: string;
                tokenAmount: RpcTokenAmount;
              };
            };
          };
        };
      }[];
    }>("getTokenAccountsByOwner", [
      address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);
    return (r?.value ?? []).map((v) => ({
      address: v.pubkey,
      mint: v.account.data.parsed.info.mint,
      owner: v.account.data.parsed.info.owner,
      amount: v.account.data.parsed.info.tokenAmount,
    }));
  }

  /** Largest token accounts for a mint (holder-concentration source). */
  async getLargestAccounts(mint: string): Promise<RpcLargestAccount[] | null> {
    const r = await this.call<{
      value: {
        address: string;
        uiAmount: number | null;
        decimals: number | null;
        amount: string;
      }[];
    }>("getTokenLargestAccounts", [mint]);
    if (!r?.value) return null;
    return r.value.slice(0, SOLANA_CONFIG.largestAccounts).map((v) => ({
      address: v.address,
      amount: { uiAmount: v.uiAmount, decimals: v.decimals, amount: v.amount },
      owner: null,
    }));
  }

  /** Resolve owners for token accounts in one batched call. */
  async resolveOwners(tokenAccounts: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (tokenAccounts.length === 0) return out;
    const r = await this.call<{
      value: ({ data: { parsed: { info: { owner: string } } } } | null)[];
    }>("getMultipleAccounts", [tokenAccounts, { encoding: "jsonParsed" }]);
    if (!r?.value) return out;
    for (let i = 0; i < tokenAccounts.length; i++) {
      const owner = r.value[i]?.data?.parsed?.info?.owner;
      if (owner) out.set(tokenAccounts[i], owner);
    }
    return out;
  }

  /** Token supply (whole tokens) for a mint. */
  async getTokenSupply(mint: string): Promise<number | null> {
    const r = await this.call<{ value: { uiAmount: number | null } }>("getTokenSupply", [mint]);
    return r?.value?.uiAmount ?? null;
  }

  /** Recent signature activity for any address (wallet or mint). */
  async getSignatures(address: string, limit = 25): Promise<RpcSignature[] | null> {
    const r = await this.call<
      { signature: string; blockTime: number | null; err: unknown }[]
    >("getSignaturesForAddress", [address, { limit: Math.max(1, Math.min(100, limit)) }]);
    if (!r) return null;
    return r.map((s) => ({ signature: s.signature, blockTime: s.blockTime, err: s.err }));
  }
}