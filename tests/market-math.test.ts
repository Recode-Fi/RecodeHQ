import { describe, expect, it } from "vitest";
import {
  changePct,
  midPrice,
  quoteFreshness,
  spreadPct,
  tokenMarketCap,
  updatedSecondsAgo,
} from "../src/lib/market-math";

/**
 * Live-verified fixtures (Robinhood Stock Token quotes, 2026-09):
 * SPY 742.38 · NVDA 232.12 · AAPL 334.07 · GOOGL 343.80 · GLD 399.87
 */
const QUOTES: { symbol: string; bid: number; ask: number }[] = [
  { symbol: "SPY", bid: 742.1, ask: 742.66 },
  { symbol: "NVDA", bid: 231.9, ask: 232.34 },
  { symbol: "AAPL", bid: 333.85, ask: 334.29 },
  { symbol: "GOOGL", bid: 343.5, ask: 344.1 },
  { symbol: "GLD", bid: 399.6, ask: 400.14 },
];

describe("midPrice", () => {
  it("computes (bid+ask)/2 for every verified quote", () => {
    for (const q of QUOTES) {
      expect(midPrice(q.bid, q.ask)).toBeCloseTo((q.bid + q.ask) / 2, 10);
    }
  });

  it("falls back to the available side when one is missing", () => {
    expect(midPrice(null, 232.34)).toBe(232.34);
    expect(midPrice(231.9, null)).toBe(231.9);
  });

  it("never invents a price without any valid side", () => {
    expect(midPrice(null, null)).toBeNull();
    // A NaN bid counts as "unavailable" → falls back to the valid ask side.
    expect(midPrice(Number.NaN, 1)).toBe(1);
  });
});

describe("spreadPct", () => {
  it("is (ask-bid)/mid × 100", () => {
    expect(spreadPct(100, 101)).toBeCloseTo((1 / 100.5) * 100, 10);
  });

  it("is null for one-sided quotes (no meaningful spread)", () => {
    expect(spreadPct(null, 100)).toBeNull();
    expect(spreadPct(100, null)).toBeNull();
  });

  it("is null for crossed/inverted quotes with non-positive mid", () => {
    expect(spreadPct(0, 0)).toBeNull();
  });
});

describe("changePct (24H change)", () => {
  it("computes signed change against previous close", () => {
    expect(changePct(232.12, 225.65)).toBeCloseTo(((232.12 - 225.65) / 225.65) * 100, 8);
    expect(changePct(742.38, 764.21)).toBeCloseTo(-2.8565, 3); // SPY −2.87% style fall
  });

  it("is neutral-gray null when either side is missing or invalid", () => {
    expect(changePct(null, 100)).toBeNull();
    expect(changePct(100, null)).toBeNull();
    expect(changePct(100, 0)).toBeNull();
    expect(changePct(Number.NaN, 100)).toBeNull();
  });
});

describe("tokenMarketCap", () => {
  it("is price × circulating supply only when supply is verified", () => {
    expect(tokenMarketCap(232.12, 95_800)).toBeCloseTo(232.12 * 95_800, 6);
  });

  it("is null without reliable supply — never a fabricated cap", () => {
    expect(tokenMarketCap(232.12, null)).toBeNull();
    expect(tokenMarketCap(null, 1_000)).toBeNull();
    expect(tokenMarketCap(232.12, 0)).toBeNull();
  });
});

describe("quoteFreshness (stale detection)", () => {
  const now = 1_000_000_000_000;
  it("marks fresh quotes LIVE within the window", () => {
    expect(quoteFreshness(now - 15_000, now, 120_000)).toBe("live");
  });
  it("marks old quotes STALE beyond the window", () => {
    expect(quoteFreshness(now - 121_000, now, 120_000)).toBe("stale");
  });
  it("marks never-received data UNAVAILABLE", () => {
    expect(quoteFreshness(null, now, 120_000)).toBe("unavailable");
  });
});

describe("updatedSecondsAgo (honest ~15s provider cache)", () => {
  const now = 1_700_000_000_000;
  it("reports second precision for fresh quotes", () => {
    expect(updatedSecondsAgo(now - 12_000, now)).toBe("12s ago");
  });
  it("rolls to minutes/hours instead of overstating freshness", () => {
    expect(updatedSecondsAgo(now - 120_000, now)).toBe("2m ago");
    expect(updatedSecondsAgo(now - 3_600_000, now)).toBe("1h ago");
  });
  it("is null for future timestamps", () => {
    expect(updatedSecondsAgo(now + 1_000, now)).toBeNull();
  });
});
