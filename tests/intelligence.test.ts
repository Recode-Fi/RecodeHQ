import { afterEach, describe, expect, it } from "vitest";
import {
  computeIntelligence,
  DEFAULT_THRESHOLDS,
  thresholdsFromEnv,
  type IntelCandle,
} from "../src/lib/intelligence";

/** Deterministic synthetic history (1h closes). */
function series(closes: number[], vols?: number[]): IntelCandle[] {
  return closes.map((c, i) => ({
    t: 1_700_000_000_000 + i * 3_600_000,
    o: c,
    h: c,
    l: c,
    c,
    v: vols ? vols[i] ?? null : null,
  }));
}

const UPTREND = series(Array.from({ length: 60 }, (_, i) => 100 * 1.02 ** i));
const DOWNTREND = series(Array.from({ length: 60 }, (_, i) => 100 * 0.98 ** i));
const FLAT = series(Array.from({ length: 60 }, () => 100));
const DAY_VOLS = Array.from({ length: 72 }, () => 100_000); // 3 days × 24 × 100k

afterEach(() => {
  delete process.env.RECODE_MOMENTUM_WEIGHTS;
  delete process.env.RECODE_LIQUIDITY_THRESHOLDS;
  delete process.env.RECODE_VOLATILITY_THRESHOLDS;
});

describe("momentum (deterministic from verified candles)", () => {
  it("sustained rally scores high", () => {
    const r = computeIntelligence({ candles: UPTREND, candleTimeframe: "1h" });
    expect(r.momentum?.score).toBeGreaterThan(70);
  });
  it("sustained selloff scores low", () => {
    const r = computeIntelligence({ candles: DOWNTREND, candleTimeframe: "1h" });
    expect(r.momentum?.score).toBeLessThan(30);
  });
  it("flat market scores exactly 50 — no invented drift", () => {
    const r = computeIntelligence({ candles: FLAT, candleTimeframe: "1h" });
    expect(r.momentum?.score).toBe(50);
  });
  it("same inputs always produce the same score", () => {
    const a = computeIntelligence({ candles: UPTREND, candleTimeframe: "1h" });
    const b = computeIntelligence({ candles: UPTREND, candleTimeframe: "1h" });
    expect(a.momentum?.score).toBe(b.momentum?.score);
  });
  it("is null with insufficient history and reports the reason", () => {
    const r = computeIntelligence({ candles: series([100]) });
    expect(r.momentum).toBeNull();
    expect(r.unavailable.some((u) => u.startsWith("Momentum"))).toBe(true);
  });
});

describe("volume activity (relative volume)", () => {
  it("HIGH when 24h volume greatly exceeds average daily candle volume", () => {
    const r = computeIntelligence({
      candles: series(FLAT.map((c) => c.c), DAY_VOLS),
      candleTimeframe: "1h",
      volume24h: 10_000_000, // avg daily ≈ 2.4M → rvol ≈ 4.2
    });
    expect(r.volumeActivity?.label).toBe("HIGH");
  });
  it("LOW when volume is far below average", () => {
    const r = computeIntelligence({
      candles: series(FLAT.map((c) => c.c), DAY_VOLS),
      candleTimeframe: "1h",
      volume24h: 100_000,
    });
    expect(r.volumeActivity?.label).toBe("LOW");
  });
  it("null with a reason when no verified volume exists", () => {
    const r = computeIntelligence({ candles: UPTREND, candleTimeframe: "1h", volume24h: null });
    expect(r.volumeActivity).toBeNull();
  });
});

describe("liquidity (volume + spread)", () => {
  it("HIGH for deep volume and a tight spread", () => {
    const r = computeIntelligence({ volume24h: 10_000_000, spreadPct: 0.05 });
    expect(r.liquidity?.label).toBe("HIGH");
    expect(r.liquidity?.score).toBeGreaterThan(66);
  });
  it("LOW for thin volume and a wide spread", () => {
    const r = computeIntelligence({ volume24h: 1_000, spreadPct: 3 });
    expect(r.liquidity?.label).toBe("LOW");
  });
  it("uses whichever verified input exists", () => {
    const onlyVol = computeIntelligence({ volume24h: 10_000_000, spreadPct: null });
    expect(onlyVol.liquidity).not.toBeNull();
    const onlySpread = computeIntelligence({ volume24h: null, spreadPct: 0.1 });
    expect(onlySpread.liquidity?.label).toBe("HIGH");
  });
  it("null when neither volume nor spread is available", () => {
    const r = computeIntelligence({ volume24h: null, spreadPct: null });
    expect(r.liquidity).toBeNull();
    expect(r.unavailable.some((u) => u.startsWith("Liquidity"))).toBe(true);
  });
});

describe("volatility (annualized realized stddev)", () => {
  it("LOW for constant closes (zero variance)", () => {
    const r = computeIntelligence({ candles: FLAT, candleTimeframe: "1h" });
    expect(r.volatility?.label).toBe("LOW");
  });
  it("HIGH for violent alternating moves", () => {
    const wild = series(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 100 : 130)));
    const r = computeIntelligence({ candles: wild, candleTimeframe: "1h" });
    expect(r.volatility?.label).toBe("HIGH");
  });
  it("null below the minimum candle count", () => {
    const r = computeIntelligence({ candles: series([100, 101, 102]), candleTimeframe: "1h" });
    expect(r.volatility).toBeNull();
    expect(r.unavailable.some((u) => u.startsWith("Volatility"))).toBe(true);
  });
});

describe("trend (SMA structure)", () => {
  it("BULLISH on rising closes, BEARISH on falling closes", () => {
    expect(computeIntelligence({ candles: UPTREND }).trend?.label).toBe("BULLISH");
    expect(computeIntelligence({ candles: DOWNTREND }).trend?.label).toBe("BEARISH");
  });
  it("NEUTRAL on a flat market", () => {
    expect(computeIntelligence({ candles: FLAT }).trend?.label).toBe("NEUTRAL");
  });
});

describe("dataConfidence + configurable thresholds", () => {
  it("confidence is 1 when everything has data, lower otherwise", () => {
    const full = computeIntelligence({
      candles: series(FLAT.map((c) => c.c), DAY_VOLS),
      candleTimeframe: "1h",
      volume24h: 240_000,
      spreadPct: 0.1,
    });
    expect(full.dataConfidence).toBe(1);
    const bare = computeIntelligence({ candles: series([100]) });
    expect(bare.dataConfidence).toBeLessThan(0.5);
  });

  it("env overrides are applied (RECODE_MOMENTUM_WEIGHTS)", () => {
    process.env.RECODE_MOMENTUM_WEIGHTS = "0.9,0.05,0.05";
    expect(thresholdsFromEnv().momentumWeights).toEqual([0.9, 0.05, 0.05]);
  });

  it("malformed env values fall back to defaults — never crash", () => {
    process.env.RECODE_LIQUIDITY_THRESHOLDS = "oops";
    expect(thresholdsFromEnv()).toEqual(DEFAULT_THRESHOLDS);
  });

  it("momentum reacts to weight changes (deterministic, documented)", () => {
    const base = computeIntelligence({ candles: UPTREND, candleTimeframe: "1h" });
    process.env.RECODE_MOMENTUM_WEIGHTS = "1,0,0"; // only the 1h return counts
    const r1Only = computeIntelligence(
      { candles: UPTREND, candleTimeframe: "1h" },
      thresholdsFromEnv(),
    );
    // 1h return alone is a much weaker signal than the blended 24h/7d trend.
    expect(r1Only.momentum?.score).toBeLessThan(base.momentum?.score ?? 0);
  });
});