import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asFiniteNumber, asNonEmptyString, errorMessage, jitter } from "../util";
import { RateLimitError, SkipError } from "./rpc";

export interface ExplorerAddressInfo {
  address: string;
  isContract: boolean;
  contractType: string | null;
  creator: string | null;
  creationTxHash: string | null;
  creationTimestamp: number | null;
  txCount: number | null;
  tokenTransfersCount: number | null;
  nativeBalanceWei: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  tokenTotalSupplyRaw: string | null;
  exchangeRate: number | null;
  holdersCount: number | null;
  firstFundedTimestamp: number | null;
}

export interface ExplorerAddressTx {
  hash: string;
  ts: number | null;
  from: string | null;
  to: string | null;
  valueWei: string | null;
  fee: number | null;
  method: string | null;
  status: string | null;
}

export interface ExplorerAddressTransfer {
  txHash: string;
  ts: number | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  decimals: number | null;
  from: string | null;
  to: string | null;
  amount: number | null;
  usd: number | null;
}

export interface ExplorerContractInfo {
  isVerified: boolean | null;
  compiler: string | null;
  optimizationEnabled: boolean | null;
  evmVersion: string | null;
  license: string | null;
}

/**
 * Robinhood Chain explorer (Blockscout v2) — address/contract scope. Powers
 * wallet activity history and the contract scanner with verified on-chain
 * facts. Tolerant parsing: unexpected shapes degrade to "no data".
 */
export class ExplorerProvider {
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

  private async get<T>(path: string, timeoutMs = SYNC_CONFIG.requestTimeoutMs): Promise<T> {
    if (!this.url) throw new SkipError("Explorer not configured");
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Explorer backing off");
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
      if (res.status === 404) throw new SkipError("not found");
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
        2_000 * 2 ** Math.min(this.state.consecutiveFailures, 5),
      );
      this.nextAllowedAt = Date.now() + delay + jitter(300);
      throw err;
    }
  }

  /** /api/v2/addresses/{hash} — creator, deployment, counters, token facts. */
  async addressInfo(address: string): Promise<ExplorerAddressInfo | null> {
    try {
      const j = await this.get<Record<string, unknown>>(`/api/v2/addresses/${address}`, 20_000);
      const creatorRec = j.creator as Record<string, unknown> | undefined;
      const tokenRec = j.token as Record<string, unknown> | undefined;
      const tsRaw = asNonEmptyString(j.creation_timestamp);
      const parsed = tsRaw ? Date.parse(tsRaw) : null;
      const fundedRaw = asNonEmptyString(j.first_funded_timestamp);
      const funded = fundedRaw ? Date.parse(fundedRaw) : null;
      const coin = j.coin_balance;
      return {
        address: address.toLowerCase(),
        isContract: j.is_contract === true,
        contractType: asNonEmptyString(j.contract_type),
        creator: asNonEmptyString(creatorRec?.hash),
        creationTxHash: asNonEmptyString(j.creation_transaction_hash),
        creationTimestamp: parsed != null && Number.isFinite(parsed) ? parsed : null,
        txCount: asFiniteNumber(j.transactions_count),
        tokenTransfersCount: asFiniteNumber(j.token_transfers_count),
        nativeBalanceWei: typeof coin === "string" ? coin : null,
        tokenName: asNonEmptyString(tokenRec?.name),
        tokenSymbol: asNonEmptyString(tokenRec?.symbol),
        tokenDecimals: asFiniteNumber(tokenRec?.decimals),
        tokenTotalSupplyRaw: asNonEmptyString(tokenRec?.total_supply),
        exchangeRate: asFiniteNumber(tokenRec?.exchange_rate),
        holdersCount: asFiniteNumber(tokenRec?.holders_count),
        firstFundedTimestamp: funded != null && Number.isFinite(funded) ? funded : null,
      };
    } catch {
      return null;
    }
  }

  /** /api/v2/addresses/{hash}/transactions — normal transactions. */
  async addressTxs(address: string, limit = 30): Promise<ExplorerAddressTx[] | null> {
    try {
      const raw = await this.get<{ items?: Record<string, unknown>[] }>(
        `/api/v2/addresses/${address}/transactions`,
        30_000,
      );
      const items = raw.items ?? [];
      const out: ExplorerAddressTx[] = [];
      for (const item of items) {
        const hash = asNonEmptyString(item.hash);
        if (!hash) continue;
        const tsRaw = asNonEmptyString(item.timestamp);
        const ts = tsRaw ? Date.parse(tsRaw) : null;
        const feeRec = item.fee as Record<string, unknown> | undefined;
        const methodRec = item.method as Record<string, unknown> | undefined;
        const status = item.status;
        out.push({
          hash,
          ts: ts != null && Number.isFinite(ts) ? ts : null,
          from: asNonEmptyString((item.from as Record<string, unknown> | undefined)?.hash),
          to: asNonEmptyString((item.to as Record<string, unknown> | undefined)?.hash),
          valueWei: asNonEmptyString(item.value),
          fee: feeRec ? asFiniteNumber(feeRec.value) : null,
          method: asNonEmptyString(methodRec?.name),
          status: typeof status === "string" ? status : null,
        });
        if (out.length >= limit) break;
      }
      return out;
    } catch {
      return null;
    }
  }

  /** /api/v2/addresses/{hash}/token-transfers — ERC-20 activity. */
  async addressTokenTransfers(address: string, limit = 60): Promise<ExplorerAddressTransfer[] | null> {
    try {
      const raw = await this.get<{ items?: Record<string, unknown>[] }>(
        `/api/v2/addresses/${address}/token-transfers`,
        30_000,
      );
      const items = raw.items ?? [];
      const out: ExplorerAddressTransfer[] = [];
      for (const item of items) {
        const txHash = asNonEmptyString(item.transaction_hash ?? item.tx_hash);
        if (!txHash) continue;
        const token = item.token as Record<string, unknown> | undefined;
        const total = (item.total as Record<string, unknown> | undefined) ?? {};
        const valueRaw = asNonEmptyString(total.value);
        const dec = asFiniteNumber(total.decimals);
        const tsRaw = asNonEmptyString(item.timestamp);
        const ts = tsRaw ? Date.parse(tsRaw) : null;
        let amount: number | null = null;
        if (valueRaw != null && dec != null) {
          try {
            amount = Number(BigInt(valueRaw)) / 10 ** dec;
          } catch {
            amount = null;
          }
        }
        out.push({
          txHash,
          ts: ts != null && Number.isFinite(ts) ? ts : null,
          tokenAddress: asNonEmptyString(token?.address),
          tokenSymbol: asNonEmptyString(token?.symbol),
          tokenName: asNonEmptyString(token?.name),
          decimals: dec,
          from: asNonEmptyString((item.from as Record<string, unknown> | undefined)?.hash),
          to: asNonEmptyString((item.to as Record<string, unknown> | undefined)?.hash),
          amount,
          usd: null,
        });
        if (out.length >= limit) break;
      }
      return out;
    } catch {
      return null;
    }
  }

  /** /api/v2/smart-contracts/{address} — verification facts. */
  async smartContract(address: string): Promise<ExplorerContractInfo | null> {
    try {
      const j = await this.get<Record<string, unknown>>(
        `/api/v2/smart-contracts/${address}`,
        20_000,
      );
      return {
        isVerified: typeof j.is_verified === "boolean" ? j.is_verified : null,
        compiler: asNonEmptyString(j.compiler_version),
        optimizationEnabled:
          typeof j.optimization_enabled === "boolean" ? j.optimization_enabled : null,
        evmVersion: asNonEmptyString(j.evm_version),
        license: asNonEmptyString(j.license_type),
      };
    } catch {
      return null;
    }
  }
}
