import { describe, expect, it } from "vitest";
import { whaleEventsFromDeltas } from "@/server/solana/engine";
import type { SolanaToken } from "@/server/solana/types";

/**
 * Whale classification over largest-account balance deltas — evidence
 * based: paired in/out within 5% → transfer; unpaired → accumulation
 * or distribution. USD requires a verified price; below-threshold
 * deltas produce no events.
 */
function token(priceUsd: number | null, supply: number | null = 1_000_000): SolanaToken {
  return {
    mint: "Mint111111111111111111111111111111111111111",
    symbol: "TEST",
    name: null,
    logoUrl: null,
    decimals: 6,
    priceUsd,
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
    supply,
    firstSeen: 0,
    updatedAt: 0,
    sources: [],
  };
}

const NOW = 1_000_000;

describe("whaleEventsFromDeltas", () => {
  it("returns nothing without a verified price", () => {
    const events = whaleEventsFromDeltas(
      "Mint111111111111111111111111111111111111111",
      token(null),
      { A: 100 },
      { A: 200 },
      new Map(),
      NOW,
      25_000,
    );
    expect(events).toHaveLength(0);
  });

  it("drops sub-threshold movements", () => {
    const events = whaleEventsFromDeltas(
      "Mint111111111111111111111111111111111111111",
      token(1),
      { A: 100 },
      { A: 101 },
      new Map(),
      NOW,
      25_000,
    );
    expect(events).toHaveLength(0);
  });

  it("classifies a paired in/out as a transfer", () => {
    const owners = new Map([
      ["accIn", "WalletIn"],
      ["accOut", "WalletOut"],
    ]);
    const events = whaleEventsFromDeltas(
      "Mint111111111111111111111111111111111111111",
      token(10),
      { accOut: 10_000, accIn: 0 },
      { accOut: 0, accIn: 10_000 },
      owners,
      NOW,
      25_000,
    );
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === "transfer")).toBe(true);
    // USD is the signed balance delta × verified price (inflow +, outflow −).
    expect(events.every((e) => e.usd != null && Math.abs(e.usd) === 100_000)).toBe(true);
    expect(events.map((e) => e.wallet).sort()).toEqual(["WalletIn", "WalletOut"]);
  });

  it("classifies an unpaired inflow as accumulation and outflow as distribution", () => {
    const events = whaleEventsFromDeltas(
      "Mint111111111111111111111111111111111111111",
      token(100),
      { accA: 500 },
      { accA: 600 },
      new Map([["accA", "Whale"]]),
      NOW,
      5_000,
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("accumulation");
    expect(events[0].usd).toBe(10_000);
    // 600 of 1,000,000 supply = 0.06%.
    expect(events[0].sharePctAfter).toBeCloseTo(0.06, 5);
  });
});