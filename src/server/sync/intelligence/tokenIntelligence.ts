/**
 * ============================================================
 * RECODE — TokenIntelligenceProvider abstraction
 * ============================================================
 * The application depends on THIS interface, never directly on
 * Blockscout. Two providers implement it:
 *
 *   • IndexerProvider   (RECODE_INDEXER_URL) = PRIMARY
 *   • BlockscoutProvider (Robinhood Chain    = FALLBACK (kept for
 *                          explorer, 403-prone)  resilience only)
 *
 * Failure chain (documented, no zeros, no fabrication):
 *   1. primary indexer       → fresh provider data
 *   2. cached valid data     → store, within freshness window
 *   3. blockscout fallback   → fresh fallback data
 *   4. cached stale data     → marked stale (never shown as live)
 *   5. unavailable           → explicit null + reason
 *
 * Every resolved result carries full provenance (provider, source,
 * updatedAt, freshness, confidence) and provider health snapshots.
 */

import type { BlockscoutProvider, BlockscoutHolder } from "../providers/blockscout";
import type { IndexerProvider } from "../providers/indexer";
import { GoldskyTokenIntelligence } from "../providers/goldsky";
import type { SyncStore } from "../store";
import type { Provenance } from "./provenance";
import { provenance } from "./provenance";

export interface NormalizedHolderRows {
  /** Verified total holder count (null when the source gives none). */
  total: number | null;
  /** Raw holder rows ordered by balance (largest first). */
  rows: { address: string | null; balance: number | null; sharePct: number | null }[];
  provenance: Provenance;
}

export interface NormalizedSupply {
  kind: string;
  source: string;
  totalSupplyRaw: string | null;
  decimals: number | null;
  /** Verified circulating figure ONLY when the source provides one. */
  circulatingSupply: number | null;
  circulatingMarketCap: number | null;
  updatedAt: number;
}

export interface NormalizedTransfer {
  id: string;
  ts: number;
  from: string;
  to: string;
  amount: number | null;
  usd: number | null;
  /** Parent transaction hash when the source provides it (optional — legacy rows). */
  hash?: string | null;
}

/** The provider contract — implement this to plug in a new source. */
export interface TokenIntelligenceProvider {
  readonly name: string;
  readonly role: "primary" | "fallback";
  getHolders(address: string): Promise<NormalizedHolderRows | null>;
  getHolderBalance(address: string, holder: string): Promise<number | null>;
  getTransfers(address: string, limit: number): Promise<NormalizedTransfer[] | null>;
  getTokenSupply(address: string, decimals: number | null): Promise<NormalizedSupply | null>;
  health(): { provider: string; role: string; url: string | null; state: unknown };
}

/**
 * Provider selection — the rest of RECODE never cares which is used:
 *   1. Goldsky hosted subgraph (RECODE_GOLDSKY_SUBGRAPH_URL) — PRIMARY
 *      (official Robinhood Chain support, indexed holders/transfers)
 *   2. REST indexer (RECODE_INDEXER_URL) — primary when configured
 *   3. none — callers fall to cache + Blockscout fallback
 */
export function createPrimaryIntelProvider(
  goldskyUrl: string | null,
  indexer: IndexerProvider,
): TokenIntelligenceProvider | null {
  if (goldskyUrl && /^https?:\/\//i.test(goldskyUrl)) {
    return new GoldskyTokenIntelligence(goldskyUrl);
  }
  if (indexer.state.configured) {
    return new IndexerTokenIntelligence(indexer);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Primary adapter: RECODE_INDEXER_URL                                  */
/* ------------------------------------------------------------------ */

export class IndexerTokenIntelligence implements TokenIntelligenceProvider {
  readonly name = "robinhood-indexer";
  readonly role = "primary" as const;
  constructor(private indexer: IndexerProvider) {}

  async getHolders(address: string): Promise<NormalizedHolderRows | null> {
    const full = await this.indexer.holdersFull(address);
    if (!full) return null;
    if (full.total == null && full.rows.length === 0) return null;
    return {
      total: full.total,
      rows: full.rows.map((r) => ({ address: r.address, balance: r.balance, sharePct: r.sharePct })),
      provenance: provenance(
        "robinhood-indexer",
        "indexer-primary",
        "chain-indexer",
        Date.now(),
        Date.now(),
        300_000,
      ),
    };
  }

  async getHolderBalance(address: string, holder: string): Promise<number | null> {
    return this.indexer.holderBalance(address, holder);
  }

  async getTransfers(address: string, limit: number): Promise<NormalizedTransfer[] | null> {
    const rows = await this.indexer.tokenTransfers(address, limit);
    if (rows == null) return null;
    return rows.map((r) => ({
      id: `${r.hash}:${r.from}:${r.to}`,
      ts: r.ts,
      from: r.from,
      to: r.to,
      amount: r.amount,
      usd: r.usd,
    }));
  }

  async getTokenSupply(address: string, decimals: number | null): Promise<NormalizedSupply | null> {
    const raw = await this.indexer.tokenSupply(address);
    if (!raw) return null;
    return {
      kind: "chain-indexer",
      source: "robinhood-indexer",
      totalSupplyRaw: raw.totalSupplyRaw,
      decimals: raw.decimals ?? decimals,
      circulatingSupply: null, // indexer supply is TOTAL supply — never relabeled
      circulatingMarketCap: null,
      updatedAt: Date.now(),
    };
  }

  health() {
    const h = this.indexer.health();
    return { provider: h.provider, role: this.role, url: h.url, state: h.state };
  }
}

/* ------------------------------------------------------------------ */
/* Fallback adapter: Blockscout (Robinhood Chain explorer)              */
/* ------------------------------------------------------------------ */

export class BlockscoutTokenIntelligence implements TokenIntelligenceProvider {
  readonly name = "robinhood-explorer";
  readonly role = "fallback" as const;
  constructor(private blockscout: BlockscoutProvider, private decimalsOf: (address: string) => number | null) {}

  async getHolders(address: string): Promise<NormalizedHolderRows | null> {
    const list = await this.blockscout.holders(address);
    if (!list || list.length === 0) return null;
    const detail = await this.blockscout.tokenDetail(address);
    const total = detail?.holders ?? null;
    const dec = this.decimalsOf(address) ?? detail?.decimals ?? 18;
    const rows = list
      .map((h: BlockscoutHolder) => {
        let balance: number | null = null;
        try {
          balance = Number(BigInt(h.valueRaw)) / 10 ** dec;
        } catch {
          balance = null;
        }
        return { address: h.address, balance, sharePct: null as number | null };
      })
      .filter((r) => r.balance != null);
    return {
      total,
      rows,
      provenance: provenance(
        "robinhood-explorer",
        "blockscout-fallback",
        "verified-explorer",
        Date.now(),
        Date.now(),
        300_000,
      ),
    };
  }

  async getHolderBalance(address: string, holder: string): Promise<number | null> {
    const list = await this.blockscout.holders(address, 1000);
    if (!list) return null;
    const hit = list.find((h) => h.address === holder.toLowerCase());
    if (!hit) return null;
    try {
      return Number(BigInt(hit.valueRaw)) / 10 ** (this.decimalsOf(address) ?? 18);
    } catch {
      return null;
    }
  }

  async getTransfers(address: string, limit: number): Promise<NormalizedTransfer[] | null> {
    const rows = await this.blockscout.transfers(address, limit);
    if (!rows) return null;
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      from: r.from,
      to: r.to,
      amount: r.amount,
      usd:
        r.tokenSnapshot?.exchangeRate != null && r.amount != null
          ? r.amount * r.tokenSnapshot.exchangeRate
          : null,
    }));
  }

  async getTokenSupply(address: string, decimals: number | null): Promise<NormalizedSupply | null> {
    const detail = await this.blockscout.tokenDetail(address);
    if (!detail || detail.totalSupplyRaw == null) return null;
    return {
      kind: "verified-explorer",
      source: "robinhood-explorer",
      totalSupplyRaw: detail.totalSupplyRaw,
      decimals: detail.decimals ?? decimals,
      circulatingSupply: null, // explorer reports TOTAL supply — never relabeled
      circulatingMarketCap: null,
      updatedAt: Date.now(),
    };
  }

  health() {
    return {
      provider: "blockscout-fallback",
      role: this.role,
      url: this.blockscout.url,
      state: { ...this.blockscout.state },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Orchestration: primary → fresh cache → fallback → stale → null       */
/* ------------------------------------------------------------------ */

export type IntelOutcome<T> =
  | { ok: true; data: T; provenance: Provenance; degraded: boolean }
  | { ok: false; reason: string; attempts: string[] };

export interface HoldersIntel {
  total: number | null;
  rows: NormalizedHolderRows["rows"];
  /** True when sharePct was derived from verified supply (provider gave none). */
  sharePctDerived: boolean;
}

function sharesFromBalances(
  rows: NormalizedHolderRows["rows"],
  totalSupply: number | null,
): { rows: NormalizedHolderRows["rows"]; derived: boolean } {
  let derived = false;
  const out = rows.map((r) => {
    if (r.sharePct != null) return r;
    if (r.balance != null && totalSupply != null && totalSupply > 0) {
      derived = true;
      return { ...r, sharePct: (r.balance / totalSupply) * 100 };
    }
    return r;
  });
  return { rows: out, derived };
}

/**
 * Holders resolution with the documented failover chain:
 * primary indexer → fresh cache → blockscout fallback → stale cache → null.
 * sharePct is derived from VERIFIED supply only when the provider gives
 * none (explicitly labeled). Never zeros, never fabricated rows.
 */
export async function resolveHolders(
  primary: TokenIntelligenceProvider | null,
  fallback: TokenIntelligenceProvider,
  store: SyncStore,
  address: string,
  totalSupply: number | null,
  freshnessMs: number,
): Promise<IntelOutcome<HoldersIntel>> {
  const now = Date.now();
  const attempts: string[] = [];
  const cached = store.get().holders[address] ?? null;

  // 1. primary indexer
  if (primary) {
    attempts.push(primary.name);
    try {
      const rows = await primary.getHolders(address);
      if (rows) {
        const { rows: withShares, derived } = sharesFromBalances(rows.rows, totalSupply);
        return {
          ok: true,
          data: { total: rows.total, rows: withShares, sharePctDerived: derived },
          provenance: rows.provenance,
          degraded: false,
        };
      }
    } catch {
      attempts.push(`${primary.name}:failed`);
    }
  } else {
    attempts.push("primary:not-configured");
  }

  // 2. cached valid data (fresh, within the freshness window)
  if (cached && cached.top.length > 0 && cached.updatedAt != null) {
    if (now - cached.updatedAt <= freshnessMs) {
      attempts.push("cache:fresh");
      return {
        ok: true,
        data: {
          total: cached.total,
          rows: cached.top.map((t) => ({ address: t.address, balance: t.balance, sharePct: t.sharePct })),
          sharePctDerived: false,
        },
        provenance: provenance(
          cached.intel?.source ?? "cache",
          "cache",
          "chain-indexer",
          cached.updatedAt,
          now,
          freshnessMs,
        ),
        degraded: true,
      };
    }
  }

  // 3. blockscout fallback
  attempts.push(fallback.name);
  try {
    const rows = await fallback.getHolders(address);
    if (rows) {
      const { rows: withShares, derived } = sharesFromBalances(rows.rows, totalSupply);
      return {
        ok: true,
        data: { total: rows.total, rows: withShares, sharePctDerived: derived },
        provenance: rows.provenance,
        degraded: false,
      };
    }
  } catch {
    attempts.push(`${fallback.name}:failed`);
  }

  // 4. cached stale data — returned explicitly marked stale, never "live"
  if (cached && cached.updatedAt != null) {
    attempts.push("cache:stale");
    return {
      ok: true,
      data: {
        total: cached.total,
        rows: cached.top.map((t) => ({ address: t.address, balance: t.balance, sharePct: t.sharePct })),
        sharePctDerived: false,
      },
      provenance: provenance(
        cached.intel?.source ?? "cache",
        "cache-stale",
        "chain-indexer",
        cached.updatedAt,
        now,
        freshnessMs,
      ),
      degraded: true,
    };
  }

  // 5. unavailable — explicit, no zeros, no fabricated rows
  return {
    ok: false,
    reason: "No verified holder data: primary indexer unavailable, cache empty, explorer unreachable",
    attempts,
  };
}

export interface HoldersIntelMeta {
  source: string;
  provider: string;
  verified: boolean;
  confidence: number;
  updatedAt: number | null;
  freshness: string;
  sharePctDerived: boolean;
}

/**
 * Persists a resolved holder intel into the store (additive `intel`
 * block + per-holder USD computed INTERNALLY as balance × verified
 * price — a provider pre-calculated USD value is never trusted).
 */
export function persistHoldersIntel(
  store: SyncStore,
  address: string,
  data: HoldersIntel,
  prov: Provenance,
  price: number | null,
): void {
  const d = store.get();
  const market = d.markets[address];
  d.holders[address] = {
    address,
    symbol: market?.symbol ?? "",
    total: data.total,
    new24h: d.holders[address]?.new24h ?? null,
    lost24h: d.holders[address]?.lost24h ?? null,
    growthPct: d.holders[address]?.growthPct ?? null,
    concentration: null,
    top: data.rows.slice(0, 100).map((r) => ({
      address: r.address,
      sharePct: r.sharePct,
      balance: r.balance,
      // whale USD computed here — balance × verified price, else null
      usd: r.balance != null && price != null && price > 0 ? r.balance * price : null,
    })),
    updatedAt: Date.now(),
    intel: {
      source: prov.source,
      provider: prov.provider,
      verified: prov.verified,
      confidence: prov.confidence,
      updatedAt: prov.updatedAt,
      freshness: prov.freshness,
      sharePctDerived: data.sharePctDerived,
    },
  };
  store.save();
}