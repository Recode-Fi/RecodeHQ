import { describe, expect, it } from "vitest";
import type { SolanaRpcProvider } from "@/server/solana/providers/solanaRpc";
import { fetchWalletActivityPage } from "@/server/solana/services/walletActivity";
import { fetchSolanaWalletBalances } from "@/server/solana/services/walletIntel";
import { resolveWalletTokenMarkets } from "@/server/solana/services/walletMarkets";
import type { SolanaStore } from "@/server/solana/store";

/**
 * Solana Wallet Intelligence pipeline — provider-injected tests:
 * SPL + Token-2022 parsing, zero-balance skipping, exact-mint pricing
 * (never symbol matches), unpriced handling, transaction classification
 * (SOL receive/send, SPL receive, structure-verified swap, failed tx,
 * details-unavailable) and signature-cursor pagination.
 */

const WALLET = "4D7KLaupE4pkvK0c9eZFLHZcGRg8ZbfMiQx3yyPPJEm";
const WSOL = "So11111111111111111111111111111111111111112";
const PUMP_MINT = "4XEtVrFaWiSSXdEYtsC3vFB7bHMrOxTPeoh8XbB7pump";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

function tokenAccount(addr: string, mint: string, uiAmount: number | null, decimals: number | null) {
  return {
    pubkey: addr,
    account: {
      data: {
        parsed: { info: { mint, owner: WALLET, tokenAmount: { uiAmount, decimals, amount: "1" } } },
      },
    },
  };
}

function makeRpc(overrides: Record<string, unknown> = {}): SolanaRpcProvider {
  const base = {
    getSolBalance: async () => 0.188592,
    getTokenAccounts: async (address: string, programId: string) => {
      if (programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC9PHnBn5qxqf6SMo") {
        // Token-2022 holding, non-zero.
        return [
          {
            address: "ata-t22",
            mint: "Token2022Mint11111111111111111111111111111",
            owner: WALLET,
            amount: { uiAmount: 5, decimals: 2, amount: "500" },
          },
        ];
      }
      return [
        { address: "ata-pump", mint: PUMP_MINT, owner: WALLET, amount: { uiAmount: 28_136.8371, decimals: 6, amount: "1" } },
        { address: "ata-usdc", mint: USDC, owner: WALLET, amount: { uiAmount: 1_481.6153, decimals: 6, amount: "1" } },
        // Zero-balance account — must be ignored.
        { address: "ata-zero", mint: "ZeroBalanceMint1111111111111111111111111", owner: WALLET, amount: { uiAmount: 0, decimals: 6, amount: "0" } },
      ];
    },
    getSignatures: async () => [
      { signature: "sig-sol-in", blockTime: 1_700_000_100, err: null },
      { signature: "sig-swap", blockTime: 1_700_000_090, err: null },
      { signature: "sig-spl-in", blockTime: 1_700_000_080, err: null },
      { signature: "sig-failed", blockTime: 1_700_000_070, err: { InstructionError: [0] } },
      { signature: "sig-nodetail", blockTime: 1_700_000_060, err: null },
    ],
    getTransaction: async (sig: string) => {
      if (sig === "sig-sol-in") {
        return {
          blockTime: 1_700_000_100,
          meta: {
            err: null,
            fee: 5000,
            preBalances: [1_000_000_000, 2_000_000_000],
            postBalances: [1_500_000_000, 1_499_995_000],
            preTokenBalances: [],
            postTokenBalances: [],
          },
          transaction: {
            message: {
              accountKeys: [{ pubkey: WALLET, signer: true, writable: true }],
              instructions: [
                {
                  programId: "11111111111111111111111111111111",
                  parsed: {
                    type: "transfer",
                    info: { source: "2ndAccount", destination: WALLET, lamports: 5e8 },
                  },
                },
              ],
            },
          },
        };
      }
      if (sig === "sig-swap") {
        return {
          blockTime: 1_700_000_090,
          meta: {
            err: null,
            fee: 5000,
            preBalances: [1_000_000_000, 9_000_000_000],
            postBalances: [1_000_000_000, 9_000_000_000],
            preTokenBalances: [
              { accountIndex: 2, mint: USDC, owner: WALLET, uiTokenAmount: { uiAmount: 100, decimals: 6 } },
              { accountIndex: 3, mint: PUMP_MINT, owner: "OtherOwner", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
            ],
            postTokenBalances: [
              { accountIndex: 2, mint: USDC, owner: WALLET, uiTokenAmount: { uiAmount: 40, decimals: 6 } },
              { accountIndex: 3, mint: PUMP_MINT, owner: "OtherOwner", uiTokenAmount: { uiAmount: 25_000, decimals: 6 } },
            ],
          },
          transaction: {
            message: {
              accountKeys: [{ pubkey: WALLET, signer: true, writable: true }],
              instructions: [
                { programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" },
                { programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC9PHnBn5qxqf6SMo" },
              ],
            },
          },
        };
      }
      if (sig === "sig-spl-in") {
        return {
          blockTime: 1_700_000_080,
          meta: {
            err: null,
            fee: 5000,
            preBalances: [1_000_000_000, 3_000_000_000],
            postBalances: [1_000_000_000, 3_000_000_000],
            preTokenBalances: [
              { accountIndex: 2, mint: PUMP_MINT, owner: "OtherOwner", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
              { accountIndex: 3, mint: PUMP_MINT, owner: WALLET, uiTokenAmount: { uiAmount: 0, decimals: 6 } },
            ],
            postTokenBalances: [
              { accountIndex: 2, mint: PUMP_MINT, owner: "OtherOwner", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
              { accountIndex: 3, mint: PUMP_MINT, owner: WALLET, uiTokenAmount: { uiAmount: 500, decimals: 6 } },
            ],
          },
          transaction: {
            message: {
              accountKeys: [{ pubkey: WALLET, signer: true, writable: true }],
              instructions: [{ programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }],
            },
          },
        };
      }
      return null; // sig-nodetail and anything else
    },
    ...overrides,
  };
  return base as unknown as SolanaRpcProvider;
}

function makeEngine(pairs: { mint: string; price: number; sym: string }[]) {
  return {
    dexscreener: {
      tokenPairs: async (mints: string[]) =>
        mints.flatMap((mint) => {
          const p = pairs.find((x) => x.mint === mint);
          return p
            ? [
                {
                  chainId: "solana",
                  dexId: "orca",
                  pairAddress: `pair-${mint}`,
                  baseToken: { address: mint, name: `${p.sym} Token`, symbol: p.sym },
                  quoteToken: { address: WSOL, symbol: "SOL" },
                  priceUsd: String(p.price),
                  txns: { h24: { buys: 10, sells: 5 } },
                  volumeUsd: { h24: 1_000 },
                  priceChange: { h24: 2 },
                  liquidity: { usd: 50_000 },
                  marketCap: p.price * 1_000_000,
                  info: { imageUrl: `https://img/${p.sym}.png` },
                },
              ]
            : [];
        }),
      search: async () => [],
    },
  } as unknown as Parameters<typeof fetchSolanaWalletBalances>[1];
}

describe("Solana wallet balances (holdings + pricing)", () => {
  it("parses SPL + Token-2022, skips zero accounts, resolves exact-mint prices", async () => {
    const store = memoryStore();
    const engine = makeEngine([
      { mint: PUMP_MINT, price: 0.0002, sym: "PUMP" },
      { mint: USDC, price: 1.0, sym: "USDC" },
      { mint: WSOL, price: 99, sym: "SOL" },
    ]);
    const b = await fetchSolanaWalletBalances(makeRpc(), engine, WALLET, store);
    expect(b.chainOnline).toBe(true);
    // SOL + pump + USDC + Token-2022 = 4; the zero account is ignored.
    expect(b.holdings).toHaveLength(4);
    const pump = b.holdings.find((h) => h.mint === PUMP_MINT);
    expect(pump?.symbol).toBe("PUMP");
    expect(pump?.amount).toBeCloseTo(28_136.8371, 4);
    expect(pump?.priceUsd).toBe(0.0002);
    expect(pump?.valueUsd).toBeCloseTo(28_136.8371 * 0.0002, 6);
    expect(pump?.status).toBe("priced");
    const t22 = b.holdings.find((h) => h.mint === "Token2022Mint11111111111111111111111111111");
    expect(t22?.amount).toBe(5);
    expect(t22?.decimals).toBe(2);
    // The Token-2022 mint has no market in this fixture → honestly unpriced.
    expect(t22?.status).toBe("no-market");
    const sol = b.holdings[0];
    expect(sol.kind).toBe("native");
    expect(sol.priceUsd).toBe(99);
    expect(sol.valueUsd).toBeCloseTo(0.188592 * 99, 6);
    expect(b.pricedCount).toBe(3);
    expect(b.unpricedCount).toBe(1);
    expect(b.totalValueUsd).toBeGreaterThan(0);
  });

  it("keeps unpriced holdings without a price and excludes them from the portfolio total", async () => {
    const store = memoryStore();
    const engine = makeEngine([{ mint: USDC, price: 1.0, sym: "USDC" }]); // pump + WSOL unpriced
    const b = await fetchSolanaWalletBalances(makeRpc(), engine, WALLET, store);
    const pump = b.holdings.find((h) => h.mint === PUMP_MINT);
    expect(pump?.priceUsd).toBeNull();
    expect(pump?.valueUsd).toBeNull();
    expect(pump?.status).toBe("no-market");
    expect(b.totalValueUsd).not.toBeNull();
    expect(b.unpricedCount).toBeGreaterThan(0);
  });

  it("only prices via exact-mint matches (symbol collision never prices)", async () => {
    const store = memoryStore();
    const engine = makeEngine([{ mint: "SomeOtherMint111111111111111111111111111", price: 5, sym: "PUMP" }]);
    const markets = await resolveWalletTokenMarkets(engine, [PUMP_MINT], store);
    expect(markets.get(PUMP_MINT)?.priceUsd).toBeNull();
    expect(markets.get(PUMP_MINT)?.symbol).toBeNull();
  });
});

describe("Solana wallet activity (transaction normalization)", () => {
  const priceOf = (mint: string | null) => (mint === null ? 99 : mint === PUMP_MINT ? 0.0002 : null);

  it("classifies SOL receive with counterparty and verified USD", async () => {
    const page = await fetchWalletActivityPage(makeRpc(), WALLET, { priceOf });
    const rec = page.records.find((r) => r.signature === "sig-sol-in");
    expect(rec?.action).toBe("receive");
    expect(rec?.label).toBe("Received");
    expect(rec?.solAmount).toBeCloseTo(0.5, 6);
    expect(rec?.counterparty).toBe("2ndAccount");
    expect(rec?.usd).toBeCloseTo(0.5 * 99, 4);
    expect(rec?.detailsUnavailable).toBe(false);
  });

  it("detects a swap only from tx structure (swap program + 2 mints moved)", async () => {
    const page = await fetchWalletActivityPage(makeRpc(), WALLET, { priceOf });
    const rec = page.records.find((r) => r.signature === "sig-swap");
    expect(rec?.action).toBe("swap");
    expect(rec?.program).toBe("Jupiter");
    // tokenMint/tokenAmount = the token received in (positive delta);
    // tokenOutMint/tokenOutAmount = the token spent (negative delta).
    expect(rec?.tokenMint).toBe(PUMP_MINT);
    expect(rec?.tokenAmount).toBe(25_000);
    expect(rec?.tokenOutMint).toBe(USDC);
    expect(rec?.tokenOutAmount).toBe(60); // 100 → 40
  });

  it("classifies a pure SPL receive with the counterparty owner", async () => {
    const page = await fetchWalletActivityPage(makeRpc(), WALLET, { priceOf });
    const rec = page.records.find((r) => r.signature === "sig-spl-in");
    expect(rec?.action).toBe("receive");
    expect(rec?.tokenMint).toBe(PUMP_MINT);
    expect(rec?.tokenAmount).toBe(500);
    expect(rec?.counterparty).toBe("OtherOwner");
    expect(rec?.usd).toBeCloseTo(500 * 0.0002, 6); // exact-mint verified price
  });

  it("renders failed transactions and details-unavailable records (never hidden)", async () => {
    const page = await fetchWalletActivityPage(makeRpc(), WALLET, { priceOf });
    expect(page.recordsCount).toBe(5); // all signatures listed
    expect(page.records.find((r) => r.signature === "sig-failed")?.failed).toBe(true);
    const nodetail = page.records.find((r) => r.signature === "sig-nodetail");
    expect(nodetail?.detailsUnavailable).toBe(true);
    expect(nodetail?.label).toBe("Transaction");
    expect(page.detailsUnavailable).toBe(1);
  });

  it("reports unavailable when signatures cannot be fetched (RPC errors)", async () => {
    const rpc = makeRpc({ getSignatures: async () => null });
    const page = await fetchWalletActivityPage(rpc, WALLET, { graceRetries: 1, graceDelayMs: 1 });
    expect(page.chainOnline).toBe(false);
    expect(page.errors[0]).toContain("Signature history unavailable");
  });

  it("grace-retries past a transient 429/backoff collision and recovers", async () => {
    let calls = 0;
    const rpc = makeRpc({
      getSignatures: async (_a: string, limit: number) => {
        calls += 1;
        // First call: provider is in a burst-collision backoff (null).
        // Second call (grace retry): the window has lifted — real data.
        if (calls === 1) return null;
        return [{ signature: "sig-after-retry", blockTime: 1_700_000_060, err: null }].slice(0, limit);
      },
      getTransaction: async () => null,
    });
    const page = await fetchWalletActivityPage(rpc, WALLET, { graceRetries: 2, graceDelayMs: 1 });
    expect(calls).toBe(2);
    expect(page.chainOnline).toBe(true);
    expect(page.recordsCount).toBe(1);
    expect(page.records[0]?.signature).toBe("sig-after-retry");
  });

  it("passes the pagination cursor through to the RPC", async () => {
    let captured: string | null | undefined;
    const rpc = makeRpc({
      getSignatures: async (_a: string, limit: number, before?: string | null) => {
        captured = before;
        return [{ signature: `sig-${before ?? "first"}`, blockTime: 1_700_000_050, err: null }].slice(0, limit);
      },
      getTransaction: async () => null,
    });
    const page = await fetchWalletActivityPage(rpc, WALLET, { before: "cursor-sig" });
    expect(captured).toBe("cursor-sig");
    expect(page.nextBefore).toBe("sig-cursor-sig");
    expect(page.hasMore).toBe(false);
  });
});