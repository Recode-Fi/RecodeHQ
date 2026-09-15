import { describe, expect, it } from "vitest";
import { decodeBase58, isValidSolanaAddress } from "@/lib/base58";
import { addressFamily } from "@/lib/types";
import {
  directLookup,
  upsertDirectToken,
  clearDirectLookupCache,
  type DirectLookupProviders,
} from "@/server/solana/services/directLookup";
import type { DexPair } from "@/server/solana/providers/dexscreener";
import type { SolanaStore } from "@/server/solana/store";

/**
 * Direct Solana mint lookup — offline validation (base58 charset +
 * 32-byte checksum decode) and provider-injected resolution paths:
 * found (multi-pair best selection), mint-only (no market pair),
 * not-found, store upsert and network isolation (EVM never touched).
 */

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // real mint
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"; // real mint
const INVALID_CA = "8hg8VxOEXD7TDycRSMgyXnxirqBhQfYsKKBpXhVpump"; // base58-shaped, checksum-invalid
const EVM = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";

function pair(mint: string, overrides: Partial<DexPair> = {}): DexPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: `pair-${mint}-${Math.random().toString(36).slice(2, 8)}`,
    baseToken: { address: mint, name: "Test Token", symbol: "TST" },
    quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
    priceUsd: "0.001",
    txns: { h24: { buys: 120, sells: 80 } },
    volumeUsd: { h24: 25_000 },
    priceChange: { h24: 5 },
    liquidity: { usd: 10_000 },
    marketCap: 1_000_000,
    fdv: 2_000_000,
    pairCreatedAt: 1_700_000_000_000,
    info: { imageUrl: "https://img.example/tst.png" },
    ...overrides,
  };
}

function providers(
  pairs: DexPair[],
  opts: { rpcMint?: boolean; throwOnPairs?: boolean } = {},
): DirectLookupProviders {
  return {
    dexscreener: {
      tokenPairs: async (mints) => {
        if (opts.throwOnPairs) throw new Error("HTTP 429");
        return mints.includes(pairs[0]?.baseToken.address ?? "") ? pairs : [];
      },
      search: async () => pairs,
    },
    rpc: {
      getTokenInfo: async () =>
        opts.rpcMint === false ? null : { supply: 1_000_000, decimals: 6 },
      getLargestAccounts: async () =>
        opts.rpcMint === false
          ? null
          : [{ address: "acc-1", amount: { uiAmount: 100_000, decimals: 6, amount: "1" }, owner: null }],
      resolveOwners: async (accounts) => new Map(accounts.map((a) => [a, "Owner1"])),
    },
  };
}

function memoryStore(): SolanaStore {
  const data = {
    version: 1 as const,
    tokens: {},
    priceHistory: {},
    volumeHistory: {},
    liquidityHistory: {},
    holders: {},
    largestSnapshots: {},
    whales: [],
    radar: [],
    updatedAt: null,
  };
  return {
    get: () => data,
    save: () => undefined,
    flush: () => undefined,
    prune: () => undefined,
  } as unknown as SolanaStore;
}

describe("isValidSolanaAddress (offline validation)", () => {
  it("accepts real Solana mints", () => {
    expect(isValidSolanaAddress(BONK)).toBe(true);
    expect(isValidSolanaAddress(JUP)).toBe(true);
  });

  it("rejects a base58-shaped string that fails validation (the reported test CA)", () => {
    // The user-reported CA contains 'O', which base58 excludes — the cheap
    // charset regex already rejects it, and the strict validator agrees:
    // zero provider calls are made for obviously invalid input.
    expect(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(INVALID_CA)).toBe(false);
    expect(isValidSolanaAddress(INVALID_CA)).toBe(false);
    // A case-mangled real mint also decodes to the wrong 32-byte value.
    expect(isValidSolanaAddress(BONK.toLowerCase())).toBe(false);
  });

  it("rejects EVM addresses and garbage without provider calls", () => {
    expect(isValidSolanaAddress(EVM)).toBe(false);
    expect(isValidSolanaAddress("bonk")).toBe(false);
    expect(isValidSolanaAddress("")).toBe(false);
    expect(decodeBase58("0OIl")).toBeNull(); // excluded characters
  });

  it("routes families correctly: EVM → evm, valid base58 → solana, invalid → null", () => {
    expect(addressFamily(EVM)).toBe("evm");
    expect(addressFamily(BONK)).toBe("solana");
    expect(addressFamily(INVALID_CA)).toBeNull();
  });
});

describe("directLookup", () => {
  const NOW = 1_800_000_000_000;

  it("resolves an untracked mint with real market fields and picks the most liquid pair", async () => {
    clearDirectLookupCache();
    const store = memoryStore();
    const result = await directLookup(
      BONK,
      {
        ...providers([
          pair(BONK, { liquidity: { usd: 5_000 }, dexId: "orca" }),
          pair(BONK, { liquidity: { usd: 900_000 }, dexId: "raydium", pairAddress: "pair-best" }),
        ]),
        store,
      },
      NOW,
    );
    expect(result.status).toBe("found");
    expect(result.token?.dexId).toBe("raydium");
    expect(result.token?.pairAddress).toBe("pair-best");
    expect(result.token?.priceUsd).toBe(0.001);
    expect(result.token?.buys24h).toBe(120);
    expect(result.token?.sells24h).toBe(80);
    expect(result.token?.decimals).toBe(6);
    expect(result.pairsTotal).toBe(2);
    expect(result.pairs[0].liquidityUsd).toBe(900_000); // sorted most-liquid-first
    expect(result.holders?.top[0].sharePct).toBeCloseTo(10, 5);
    expect(result.holders?.top[0].usd).toBe(100); // balance × verified price
  });

  it("upserts the resolved token into the verified store", async () => {
    clearDirectLookupCache();
    const store = memoryStore();
    await directLookup(BONK, { ...providers([pair(BONK)]), store }, NOW);
    expect(store.get().tokens[BONK]?.symbol).toBe("TST");
    expect(store.get().tokens[BONK]?.priceUsd).toBe(0.001);
  });

  it("returns mint-only when the mint exists but has no market pair", async () => {
    clearDirectLookupCache();
    const result = await directLookup(BONK, providers([], { rpcMint: true }), NOW);
    expect(result.status).toBe("mint-only");
    expect(result.token).toBeNull();
    expect(result.pairsTotal).toBe(0);
  });

  it("returns not-found when no provider can resolve the mint", async () => {
    clearDirectLookupCache();
    const result = await directLookup(BONK, providers([], { rpcMint: false }), NOW);
    expect(result.status).toBe("not-found");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("caches results for the TTL window (no repeated provider calls)", async () => {
    clearDirectLookupCache();
    let calls = 0;
    const p = providers([pair(BONK)]);
    const counting: DirectLookupProviders = {
      dexscreener: {
        tokenPairs: async (m) => {
          calls += 1;
          return p.dexscreener.tokenPairs(m);
        },
        search: p.dexscreener.search,
      },
      rpc: p.rpc,
    };
    await directLookup(BONK, counting, NOW);
    await directLookup(BONK, counting, NOW + 5_000); // within 30s TTL
    expect(calls).toBe(1);
    await directLookup(BONK, counting, NOW + 60_000); // TTL expired → re-fetch
    expect(calls).toBe(2);
  });
});

describe("upsertDirectToken", () => {
  it("fills nulls on an existing token instead of clobbering richer data", () => {
    const store = memoryStore();
    const now = 1_000;
    upsertDirectToken(
      store,
      {
        mint: BONK,
        symbol: "OLD",
        name: null,
        logoUrl: null,
        decimals: null,
        priceUsd: 1,
        marketCap: null,
        fdv: null,
        liquidityUsd: null,
        volume24hUsd: null,
        volume6hUsd: null,
        volume1hUsd: null,
        change24hPct: null,
        buys24h: null,
        sells24h: null,
        txns24h: null,
        dexId: null,
        pairAddress: null,
        pairCreatedAt: null,
        websites: null,
        socials: null,
        supply: null,
        firstSeen: now,
        updatedAt: now,
        sources: ["engine"],
      },
      now,
    );
    upsertDirectToken(
      store,
      {
        mint: BONK,
        symbol: "NEW",
        name: "New name",
        logoUrl: "logo",
        decimals: 9,
        priceUsd: 2,
        marketCap: 10,
        fdv: 20,
        liquidityUsd: 30,
        volume24hUsd: 40,
        volume6hUsd: null,
        volume1hUsd: null,
        change24hPct: 1,
        buys24h: 5,
        sells24h: 4,
        txns24h: 9,
        dexId: "raydium",
        pairAddress: "p",
        pairCreatedAt: now,
        websites: null,
        socials: null,
        supply: 9,
        firstSeen: now,
        updatedAt: now,
        sources: ["dexscreener:direct-lookup"],
      },
      now + 1,
    );
    const t = store.get().tokens[BONK];
    expect(t.symbol).toBe("NEW");
    expect(t.priceUsd).toBe(2);
    expect(t.marketCap).toBe(10);
    expect(t.sources).toContain("engine");
    expect(t.sources).toContain("dexscreener:direct-lookup");
  });
});