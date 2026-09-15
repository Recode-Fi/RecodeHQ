import { describe, expect, it } from "vitest";
import {
  holderConcentration,
  whaleExposure,
  whaleFlows,
  whaleUsd,
  type FlowTx,
  type HolderEntry,
} from "../src/server/sync/intelligence/whale";

describe("whaleUsd — balance × verified price, computed internally", () => {
  it("multiplies raw holder balance by the verified token price", () => {
    expect(whaleUsd(1000, 232.12)).toBeCloseTo(232_120, 6); // NVDA-style quote
    expect(whaleUsd(12_345.678, 742.38)).toBeCloseTo(12_345.678 * 742.38, 4); // SPY-style
  });
  it("is null when price is unavailable — never $0", () => {
    expect(whaleUsd(1000, null)).toBeNull();
  });
  it("is null when balance is unavailable — never $0", () => {
    expect(whaleUsd(null, 232.12)).toBeNull();
  });
  it("is null for invalid balances/prices", () => {
    expect(whaleUsd(0, 232.12)).toBeNull();
    expect(whaleUsd(-5, 232.12)).toBeNull();
    expect(whaleUsd(1000, 0)).toBeNull();
    expect(whaleUsd(Number.NaN, 100)).toBeNull();
  });
});

describe("holderConcentration — top-N share of supply", () => {
  // Largest-first ordering, verified share percentages only.
  const entries: HolderEntry[] = Array.from({ length: 60 }, (_, i) => ({
    address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    balance: 1000 - i,
    sharePct: 10 - i * 0.15, // 10.0, 9.85, ... verified
  }));

  it("sums the verified shares of the top N holders", () => {
    const top10 = holderConcentration(entries, 10);
    expect(top10?.value).toBeCloseTo(10 + 9.85 + 9.7 + 9.55 + 9.4 + 9.25 + 9.1 + 8.95 + 8.8 + 8.65, 2);
    expect(top10?.coverage).toBe(10);
  });

  it("covers top-25 and top-50 independently", () => {
    const top25 = holderConcentration(entries, 25);
    const top50 = holderConcentration(entries, 50);
    expect(top25?.coverage).toBe(25);
    expect(top50?.coverage).toBe(50);
    expect(top10(holderConcentration, entries)).toBe(true);
  });

  it("counts only verified shares in coverage — unverified shares never guessed", () => {
    const partial: HolderEntry[] = [
      { address: "0x" + "1".repeat(40), balance: 100, sharePct: 5 },
      { address: "0x" + "2".repeat(40), balance: 90, sharePct: null },
      { address: "0x" + "3".repeat(40), balance: 80, sharePct: 3 },
    ];
    const r = holderConcentration(partial, 10);
    expect(r?.value).toBe(8);
    expect(r?.coverage).toBe(2);
  });

  it("is null when NO share is verified", () => {
    const unverified: HolderEntry[] = [
      { address: "0x" + "1".repeat(40), balance: 100, sharePct: null },
    ];
    expect(holderConcentration(unverified, 10)).toBeNull();
    expect(holderConcentration([], 10)).toBeNull();
  });
});

/** monotonicity helper (keeps the table test above readable) */
function top10(fn: typeof holderConcentration, entries: HolderEntry[]): boolean {
  const a = fn(entries, 10);
  const b = fn(entries, 25);
  return (a?.value ?? 0) <= (b?.value ?? 0);
}

describe("whaleExposure — USD exposure + largest holders", () => {
  const price = 100;
  const entries: HolderEntry[] = [
    { address: "0x" + "a".repeat(40), balance: 50_000, sharePct: 25 }, // $5,000,000 → whale
    { address: "0x" + "b".repeat(40), balance: 20_000, sharePct: 10 }, // $2,000,000 → whale
    { address: "0x" + "c".repeat(40), balance: 5_000, sharePct: 2.5 }, // $500,000 → whale
    { address: "0x" + "d".repeat(40), balance: 100, sharePct: 0.05 }, // $10,000 → below
    { address: "0x" + "e".repeat(40), balance: null, sharePct: null }, // unavailable → skipped
  ];

  it("sums computed USD only for holders at/above the threshold", () => {
    const e = whaleExposure(entries, price, 100_000);
    expect(e.count).toBe(3);
    expect(e.usd).toBeCloseTo(5_000_000 + 2_000_000 + 500_000, 4);
  });

  it("respects the configurable threshold", () => {
    expect(whaleExposure(entries, price, 1_000_000).count).toBe(2);
    expect(whaleExposure(entries, price, 1_000_000).usd).toBeCloseTo(7_000_000, 4);
    const high = whaleExposure(entries, price, 10_000_000);
    expect(high.count).toBe(0);
    expect(high.usd).toBeNull(); // no whales → null, not 0
  });

  it("lists largest holders by computed USD, skipping unavailable balances", () => {
    const e = whaleExposure(entries, price, 10_000);
    expect(e.largest[0]?.address).toBe("0x" + "a".repeat(40));
    expect(e.largest[0]?.usd).toBeCloseTo(5_000_000, 4);
    expect(e.largest).toHaveLength(4); // the balance-null holder is excluded
  });

  it("is null everywhere without a verified price", () => {
    const e = whaleExposure(entries, null, 10_000);
    expect(e.usd).toBeNull();
    expect(e.count).toBe(0);
    expect(e.largest).toHaveLength(0);
  });
});

describe("whaleFlows — inflow/outflow/net from raw on-chain transfers", () => {
  const now = 1_000_000_000_000;
  const h = (n: number) => now - n * 3_600_000;
  const txs: FlowTx[] = [
    { ts: h(1), action: "buy", usd: 500_000 },
    { ts: h(2), action: "buy", usd: 250_000 },
    { ts: h(3), action: "sell", usd: 300_000 },
    { ts: h(4), action: "sell", usd: 50_000 }, // below threshold → ignored
    { ts: h(5), action: "transfer", usd: 900_000 }, // transfer → counted, no direction
    { ts: h(5), action: "buy", usd: null }, // unverified USD → never counted as 0
    { ts: h(48), action: "buy", usd: 5_000_000 }, // outside 24h window
  ];

  it("computes inflow/outflow/net over the window at the configured threshold", () => {
    const f = whaleFlows(txs, now, 24 * 3_600_000, 100_000);
    expect(f).not.toBeNull();
    expect(f?.inflowUsd).toBe(750_000);
    expect(f?.outflowUsd).toBe(300_000);
    expect(f?.netUsd).toBe(450_000);
    expect(f?.transferCount).toBe(4);
  });

  it("respects the time window — old flows excluded", () => {
    const f = whaleFlows(txs, now, 4 * 3_600_000, 100_000);
    expect(f?.transferCount).toBe(3); // the 48h-old buy is outside
  });

  it("respects the threshold", () => {
    expect(whaleFlows(txs, now, 24 * 3_600_000, 1_000_000)).toBeNull(); // nothing ≥ $1M in-window
  });

  it("returns null (not zeros) when there are no whale-size transfers", () => {
    expect(whaleFlows([{ ts: h(1), action: "buy", usd: 10 }], now, 3_600_000, 100_000)).toBeNull();
  });
});