import { SYNC_CONFIG } from "../config";
import type { ProviderState } from "../types";
import { asFiniteNumber, errorMessage, jitter } from "../util";
import { SkipError } from "./rpc";
import type {
  NormalizedHolderRows,
  NormalizedSupply,
  NormalizedTransfer,
  TokenIntelligenceProvider,
} from "../intelligence/tokenIntelligence";
import { provenance } from "../intelligence/provenance";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * ============================================================
 * Goldsky hosted-subgraph provider — PRIMARY token intelligence
 * ============================================================
 * Goldsky officially supports Robinhood Chain mainnet (chain 4663)
 * with hosted Subgraphs (goldsky.com/chains — "Robinhood Chain:
 * Mainnet, Testnet — Subgraphs, Turbo, Compose, Edge"). This provider
 * speaks GraphQL to the RECODE-deployed ERC-20 holder subgraph
 * (goldsky-subgraph/ in this repo) and implements the shared
 * TokenIntelligenceProvider interface.
 *
 * Requires RECODE_GOLDSKY_SUBGRAPH_URL (server-side only). Holder
 * shares are computed against the subgraph's indexed total supply
 * (Transfer reconstruction from genesis) — provenance flags the
 * source so incomplete reconstruction is never presented as
 * authoritative.
 */
export class GoldskyTokenIntelligence implements TokenIntelligenceProvider {
  readonly name = "goldsky-subgraph";
  readonly role = "primary" as const;
  readonly state: ProviderState;
  private nextAllowedAt = 0;

  constructor(public readonly url: string) {
    this.state = {
      configured: true,
      ok: null,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      lastError: null,
    };
  }

  private async query<T>(
    document: string,
    variables: Record<string, unknown>,
  ): Promise<T | null> {
    if (Date.now() < this.nextAllowedAt) throw new SkipError("Goldsky subgraph backing off");
    this.state.lastAttempt = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SYNC_CONFIG.requestTimeoutMs);
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: document, variables }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GraphQLResponse<T>;
      if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
      if (!json.data) throw new Error("Empty GraphQL response");
      this.state.ok = true;
      this.state.lastSuccess = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.lastError = null;
      this.nextAllowedAt = 0;
      return json.data;
    } catch (err) {
      this.state.ok = false;
      this.state.consecutiveFailures += 1;
      this.state.lastError = errorMessage(err);
      const delay = Math.min(SYNC_CONFIG.maxBackoffMs, 2_000 * 2 ** Math.min(this.state.consecutiveFailures, 6));
      this.nextAllowedAt = Date.now() + delay + jitter(250);
      throw err;
    }
  }

  async getHolders(address: string): Promise<NormalizedHolderRows | null> {
    const data = await this.query<{
      token: { id: string; totalSupply: string | null; holderCount: string | null } | null;
      tokenBalances: { account: { id: string }; value: string }[];
    } | null>(
      `query Holders($token: ID!, $first: Int!) {
        token(id: $token) { id totalSupply holderCount }
        tokenBalances(where: { token: $token, value_gt: 0 }, orderBy: value, orderDirection: desc, first: $first) {
          account { id }
          value
        }
      }`,
      { token: address.toLowerCase(), first: 100 },
    );
    if (!data?.token) return null;
    const totalSupply = asFiniteNumber(data.token.totalSupply);
    const rows = (data.tokenBalances ?? []).map((b) => {
      const balance = asFiniteNumber(b.value);
      return {
        address: b.account.id,
        balance,
        // sharePct computed against the subgraph's indexed total supply
        sharePct: totalSupply != null && totalSupply > 0 && balance != null ? (balance / totalSupply) * 100 : null,
      };
    });
    if (rows.length === 0 && (data.token.holderCount == null || data.token.holderCount === "0")) {
      return null;
    }
    return {
      total: asFiniteNumber(data.token.holderCount),
      rows,
      provenance: provenance(
        "goldsky-subgraph",
        "indexer-primary",
        "chain-indexer",
        Date.now(),
        Date.now(),
        300_000,
      ),
    };
  }

  async getHolderBalance(address: string, holder: string): Promise<number | null> {
    const data = await this.query<{ tokenBalance: { value: string } | null } | null>(
      `query Balance($id: ID!) { tokenBalance(id: $id) { value } }`,
      { id: `${address.toLowerCase()}-${holder.toLowerCase()}` },
    );
    return asFiniteNumber(data?.tokenBalance?.value ?? null);
  }

  async getTransfers(address: string, limit: number): Promise<NormalizedTransfer[] | null> {
    const data = await this.query<{
      transferEvents: {
        id: string;
        from: { id: string };
        to: { id: string };
        value: string | null;
        timestamp: string | null;
        txHash: string | null;
      }[];
    } | null>(
      `query Transfers($token: ID!, $first: Int!) {
        transferEvents(where: { token: $token }, orderBy: timestamp, orderDirection: desc, first: $first) {
          id from { id } to { id } value timestamp txHash
        }
      }`,
      { token: address.toLowerCase(), first: Math.min(limit, 100) },
    );
    const rows = data?.transferEvents ?? [];
    return rows.map((r) => ({
      id: r.id,
      ts: r.timestamp != null ? Number(r.timestamp) * 1_000 : 0,
      from: r.from.id,
      to: r.to.id,
      amount: asFiniteNumber(r.value),
      // Raw Transfer events carry no trade direction — RECODE never
      // relabels indexed transfers as buys/sells.
      usd: null,
      hash: r.txHash,
    }));
  }

  async getTokenSupply(address: string, decimals: number | null): Promise<NormalizedSupply | null> {
    const data = await this.query<{ token: { totalSupply: string | null } | null } | null>(
      `query Supply($token: ID!) { token(id: $token) { totalSupply } }`,
      { token: address.toLowerCase() },
    );
    if (!data?.token?.totalSupply) return null;
    return {
      kind: "chain-indexer",
      source: "goldsky-subgraph",
      totalSupplyRaw: data.token.totalSupply,
      decimals,
      circulatingSupply: null, // indexed total supply — never relabeled as circulating
      circulatingMarketCap: null,
      updatedAt: Date.now(),
    };
  }

  /** Indexed token metadata (additive to the interface, used by Scan). */
  async getTokenMetadata(address: string): Promise<{
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    totalSupplyRaw: string | null;
    logoUrl: string | null;
  } | null> {
    const data = await this.query<{
      token: { symbol: string | null; name: string | null; decimals: string | null; totalSupply: string | null } | null;
    } | null>(
      `query Meta($token: ID!) { token(id: $token) { symbol name decimals totalSupply } }`,
      { token: address.toLowerCase() },
    );
    if (!data?.token) return null;
    return {
      symbol: data.token.symbol,
      name: data.token.name,
      decimals: asFiniteNumber(data.token.decimals),
      totalSupplyRaw: data.token.totalSupply,
      logoUrl: null,
    };
  }

  health() {
    return { provider: "goldsky-subgraph", role: this.role, url: this.url, state: { ...this.state } };
  }
}