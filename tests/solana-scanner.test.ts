import { describe, expect, it } from "vitest";
import { buildScannerRows, smartMoneyRankings, changeVsReference } from "@/server/solana/services/scanner";
import type { SolanaStoreShape } from "@/server/solana/store";

/**
 * Solana scanner derivatives — calculated from verified store data only:
 * buy/sell ratio (null when sells is 0 or counts unknown), liquidity/volume
 * deltas vs the last observation ≥ 24h old, and smart-money ranking
 * (accumulation − distribution, transfers excluded).
 */
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

function store(): SolanaStoreShape {
  return {
    version: 1,
    tokens: {
      MintA: {
        mint: "MintA",
        symbol: "AAA",
        name: "Token A",
        logoUrl: null,
        decimals: 6,
        priceUsd: 1.5,
        marketCap: 1_500_000,
        fdv: 3_000_000,
        liquidityUsd: 120_000,
        volume24hUsd: 80_000,
        volume6hUsd: null,
        volume1hUsd: null,
        change24hPct: 4.2,
        buys24h: 300,
        sells24h: 100,
        txns24h: 400,
        dexId: "raydium",
        pairAddress: "PairA",
        pairCreatedAt: NOW - 2 * 86_400_000,
        websites: null,
        socials: null,
        supply: 1_000_000,
        firstSeen: NOW - 3 * 86_400_000,
        updatedAt: NOW - 60_000,
        sources: ["dexscreener:raydium"],
      },
      MintB: {
        mint: "MintB",
        symbol: "BBB",
        name: "Token B",
        logoUrl: null,
        decimals: 6,
        priceUsd: 0.5,
        marketCap: null,
        fdv: null,
        liquidityUsd: null,
        volume24hUsd: null,
        volume6hUsd: null,
        volume1hUsd: null,
        change24hPct: null,
        buys24h: 50,
        sells24h: 0,
        txns24h: 50,
        dexId: null,
        pairAddress: null,
        pairCreatedAt: null,
        websites: null,
        socials: null,
        supply: null,
        firstSeen: NOW - HOUR,
        updatedAt: NOW - 120_000,
        sources: [],
      },
    },
    priceHistory: {},
    volumeHistory: {
      MintA: [
        { t: NOW - 30 * HOUR, v: 50_000 },
        { t: NOW - 25 * HOUR, v: 60_000 },
        { t: NOW - HOUR, v: 70_000 },
      ],
    },
    liquidityHistory: {
      MintA: [
        { t: NOW - 30 * HOUR, v: 100_000 },
        { t: NOW - HOUR, v: 110_000 },
      ],
    },
    holders: {},
    largestSnapshots: {},
    whales: [
      {
        id: "w1",
        mint: "MintA",
        symbol: "AAA",
        wallet: "Whale1",
        kind: "accumulation",
        amount: 10_000,
        usd: 50_000,
        sharePctAfter: null,
        observedAt: NOW - HOUR,
        source: "solana-rpc:largest-account-delta",
      },
      {
        id: "w2",
        mint: "MintA",
        symbol: "AAA",
        wallet: "Whale1",
        kind: "distribution",
        amount: -5_000,
        usd: -25_000,
        sharePctAfter: null,
        observedAt: NOW - 2 * HOUR,
        source: "solana-rpc:largest-account-delta",
      },
      {
        id: "w3",
        mint: "MintA",
        symbol: "AAA",
        wallet: "Whale2",
        kind: "transfer",
        amount: 1_000,
        usd: 5_000,
        sharePctAfter: null,
        observedAt: NOW - 3 * HOUR,
        source: "solana-rpc:largest-account-delta",
      },
    ],
    radar: [],
    updatedAt: NOW,
  } as unknown as SolanaStoreShape;
}

describe("buildScannerRows", () => {
  const rows = buildScannerRows(store(), NOW);
  const a = rows.find((r) => r.mint === "MintA");
  const b = rows.find((r) => r.mint === "MintB");

  it("computes the buy/sell ratio from verified counts", () => {
    expect(a?.buySellRatio).toBeCloseTo(3, 5);
  });

  it("returns null ratio when sells is 0 (never a fabricated value)", () => {
    expect(b?.buySellRatio).toBeNull();
  });

  it("derives liquidity/volume deltas vs the latest observation ≥ 24h old", () => {
    // liquidity: 120k vs 100k reference (30h old) → +20%
    expect(a?.liquidityChange24hPct).toBeCloseTo(20, 5);
    // volume: 80k vs 60k reference (25h old) → +33.33%
    expect(a?.volumeChange24hPct).toBeCloseTo(33.333, 2);
  });

  it("keeps deltas null without a ≥24h-old reference", () => {
    expect(b?.volumeChange24hPct).toBeNull();
    expect(b?.liquidityChange24hPct).toBeNull();
  });

  it("counts whale events and distinct smart wallets per mint", () => {
    expect(a?.whaleEvents24h).toBe(3);
    expect(a?.smartWallets24h).toBe(1);
    expect(b?.whaleEvents24h).toBe(0);
  });

  it("exposes pair age in ms", () => {
    expect(a?.pairAgeMs).toBe(2 * 86_400_000);
    expect(b?.pairAgeMs).toBeNull();
  });
});

describe("smartMoneyRankings", () => {
  it("ranks wallets by net flow and excludes transfers from the net", () => {
    const ranked = smartMoneyRankings(store(), NOW, 24 * HOUR);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].wallet).toBe("Whale1");
    expect(ranked[0].netUsd).toBe(25_000); // +50k accumulation − 25k distribution
    expect(ranked[0].transfers).toBe(0);
    expect(ranked[1].wallet).toBe("Whale2");
    expect(ranked[1].netUsd).toBeNull(); // only transfers → no flow
    expect(ranked[1].transfers).toBe(1);
  });
});

describe("changeVsReference", () => {
  it("uses the newest qualifying point and returns null without one", () => {
    const history = [
      { t: NOW - 48 * HOUR, v: 100 },
      { t: NOW - 30 * HOUR, v: 200 },
      { t: NOW - HOUR, v: 250 },
    ];
    expect(changeVsReference(history, 260, 24 * HOUR, NOW)).toBeCloseTo(30, 5);
    expect(changeVsReference(history.slice(2), 260, 24 * HOUR, NOW)).toBeNull();
    expect(changeVsReference(history, null, 24 * HOUR, NOW)).toBeNull();
  });
});