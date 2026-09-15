import { describe, expect, it } from "vitest";
import { getSyncStore } from "../src/server/sync/store";
import {
  BlockscoutTokenIntelligence,
  IndexerTokenIntelligence,
  resolveHolders,
  type HoldersIntel,
  type NormalizedHolderRows,
  type TokenIntelligenceProvider,
} from "../src/server/sync/intelligence/tokenIntelligence";
import { BlockscoutProvider } from "../src/server/sync/providers/blockscout";
import { IndexerProvider } from "../src/server/sync/providers/indexer";

const NOW = Date.now();
const FRESHNESS_MS = 300_000;

/** Deterministic test addresses that never exist in the real cache file. */
const ADDR = (n: number) => `0x${n.toString(16).padStart(4, "0")}${"7e57".repeat(9)}`.slice(0, 42);

function rowsFor(address: string, balances: (number | null)[], shares: (number | null)[]): NormalizedHolderRows["rows"] {
  return balances.map((balance, i) => ({
    address: `${address}${i.toString(16).padStart(40 - address.length, "0")}`.slice(0, 42),
    balance,
    sharePct: shares[i] ?? null,
  }));
}

function makeProvider(
  name: string,
  role: "primary" | "fallback",
  result: NormalizedHolderRows | null,
  shouldThrow = false,
): TokenIntelligenceProvider {
  return {
    name,
    role,
    getHolders: async () => {
      if (shouldThrow) throw new Error("provider down");
      return result;
    },
    getHolderBalance: async () => null,
    getTransfers: async () => null,
    getTokenSupply: async () => null,
    health: () => ({ provider: name, role, url: null, state: { configured: true } }),
  };
}

/** Seeds an in-memory cache row (never persisted — save() is not called). */
function seedCache(address: string, updatedAt: number, balances: number[], source = "previous-sync") {
  const store = getSyncStore();
  store.get().holders[address] = {
    address,
    symbol: "TEST",
    total: 1234,
    new24h: null,
    lost24h: null,
    growthPct: null,
    concentration: null,
    top: balances.map((balance, i) => ({
      address: `${address}${i.toString(16).padStart(40 - address.length, "0")}`.slice(0, 42),
      sharePct: null,
      balance,
      usd: null,
    })),
    updatedAt,
  };
}

describe("resolveHolders — failover chain", () => {
  it("PRIMARY INDEXER SUCCESS: fresh provider data wins, provenance is indexer-primary", async () => {
    const address = ADDR(1);
    const primary = makeProvider("robinhood-indexer", "primary", {
      total: 5000,
      rows: rowsFor(address, [100, 50], [50, 25]),
      provenance: {
        source: "robinhood-indexer",
        provider: "indexer-primary",
        verified: true,
        confidence: 0.7,
        updatedAt: NOW,
        freshness: "live",
      },
    });
    const fallback = makeProvider("blockscout", "fallback", null);
    const r = await resolveHolders(primary, fallback, getSyncStore(), address, 200, FRESHNESS_MS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provenance.provider).toBe("indexer-primary");
      expect(r.degraded).toBe(false);
      expect(r.data.total).toBe(5000);
      expect(r.data.rows[0]?.balance).toBe(100);
    }
  });

  it("BLOCKSCOUT FALLBACK: used when the primary is not configured", async () => {
    const address = ADDR(2);
    const fallback = makeProvider("robinhood-explorer", "fallback", {
      total: 777,
      rows: rowsFor(address, [42], [null]),
      provenance: {
        source: "robinhood-explorer",
        provider: "blockscout-fallback",
        verified: true,
        confidence: 0.9,
        updatedAt: NOW,
        freshness: "live",
      },
    });
    const r = await resolveHolders(null, fallback, getSyncStore(), address, null, FRESHNESS_MS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provenance.provider).toBe("blockscout-fallback");
  });

  it("BOTH PROVIDERS FAIL + NO CACHE: explicit unavailable — never zeros", async () => {
    const address = ADDR(3);
    const primary = makeProvider("robinhood-indexer", "primary", null, true); // throws
    const fallback = makeProvider("robinhood-explorer", "fallback", null);
    const r = await resolveHolders(primary, fallback, getSyncStore(), address, null, FRESHNESS_MS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("No verified holder data");
      expect(r.attempts).toContain("robinhood-indexer:failed");
      expect(r.attempts).toContain("robinhood-explorer");
    }
  });

  it("FRESH CACHE: used when the primary fails — explicitly marked degraded", async () => {
    const address = ADDR(4);
    seedCache(address, NOW - 60_000, [300, 200]); // 1m old → fresh
    const primary = makeProvider("robinhood-indexer", "primary", null, true);
    const fallback = makeProvider("robinhood-explorer", "fallback", null);
    const r = await resolveHolders(primary, fallback, getSyncStore(), address, null, FRESHNESS_MS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provenance.provider).toBe("cache");
      expect(r.degraded).toBe(true);
      expect(r.data.rows[0]?.balance).toBe(300);
    }
  });

  it("STALE CACHE: never presented as live — freshness is 'stale'", async () => {
    const address = ADDR(5);
    seedCache(address, NOW - 2 * 3_600_000, [300]); // 2h old → stale
    const primary = makeProvider("robinhood-indexer", "primary", null, true);
    const fallback = makeProvider("robinhood-explorer", "fallback", null); // also fails
    const r = await resolveHolders(primary, fallback, getSyncStore(), address, null, FRESHNESS_MS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provenance.provider).toBe("cache-stale");
      expect(r.provenance.freshness).toBe("stale");
      expect(r.degraded).toBe(true);
    }
  });
});

  it("sharePct is DERIVED from verified supply only when the provider gives none", async () => {
    const address = ADDR(6);
    const primary = makeProvider("robinhood-indexer", "primary", {
      total: 100,
      rows: rowsFor(address, [60, 40], [null, null]),
      provenance: {
        source: "robinhood-indexer",
        provider: "indexer-primary",
        verified: true,
        confidence: 0.7,
        updatedAt: NOW,
        freshness: "live",
      },
    });
    const r = (await resolveHolders(
      primary,
      makeProvider("x", "fallback", null),
      getSyncStore(),
      address,
      200, // verified total supply
      FRESHNESS_MS,
    )) as { ok: true; data: HoldersIntel };
    expect(r.data.sharePctDerived).toBe(true);
    expect(r.data.rows[0]?.sharePct).toBeCloseTo(30, 6); // 60/200
    expect(r.data.rows[1]?.sharePct).toBeCloseTo(20, 6);
  });

  it("WITHOUT verified supply, shares stay null — never invented", async () => {
    const address = ADDR(7);
    const primary = makeProvider("robinhood-indexer", "primary", {
      total: 100,
      rows: rowsFor(address, [60, 40], [null, null]),
      provenance: {
        source: "robinhood-indexer",
        provider: "indexer-primary",
        verified: true,
        confidence: 0.7,
        updatedAt: NOW,
        freshness: "live",
      },
    });
    const r = (await resolveHolders(
      primary,
      makeProvider("x", "fallback", null),
      getSyncStore(),
      address,
      null, // no verified supply
      FRESHNESS_MS,
    )) as { ok: true; data: HoldersIntel };
    expect(r.data.sharePctDerived).toBe(false);
    expect(r.data.rows.every((row) => row.sharePct === null)).toBe(true);
  });

describe("provider health", () => {
  it("primary indexer health reports role, url and state timestamps", () => {
    const indexer = new IndexerProvider(null);
    const adapter = new IndexerTokenIntelligence(indexer);
    const h = adapter.health();
    expect(h.provider).toBe("indexer-primary");
    expect(h.role).toBe("primary");
    expect(h.url).toBeNull(); // RECODE_INDEXER_URL unconfigured
    expect(h.state.configured).toBe(false);
  });

  it("fallback blockscout health reports role and reachability state", () => {
    const blockscout = new BlockscoutProvider("https://robinhoodchain.blockscout.com");
    const adapter = new BlockscoutTokenIntelligence(blockscout, () => 18);
    const h = adapter.health();
    expect(h.provider).toBe("blockscout-fallback");
    expect(h.role).toBe("fallback");
    expect(h.url).toContain("blockscout");
    expect(h.state.configured).toBe(true);
  });

  it("source metadata is present on every provider-produced holder result", async () => {
    const address = ADDR(8);
    const primary = makeProvider("robinhood-indexer", "primary", {
      total: 10,
      rows: rowsFor(address, [1], [100]),
      provenance: {
        source: "robinhood-indexer",
        provider: "indexer-primary",
        verified: true,
        confidence: 0.7,
        updatedAt: NOW,
        freshness: "live",
      },
    });
    const r = await resolveHolders(
      primary,
      makeProvider("x", "fallback", null),
      getSyncStore(),
      address,
      null,
      FRESHNESS_MS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provenance.source).toBe("robinhood-indexer");
      expect(r.provenance.updatedAt).not.toBeNull();
      expect(r.provenance.confidence).toBeGreaterThan(0);
      expect(r.provenance.verified).toBe(true);
    }
  });
});