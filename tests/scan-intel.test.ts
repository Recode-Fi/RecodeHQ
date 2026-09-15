import { describe, expect, it } from "vitest";
import {
  aggregateActivity,
  contractAge,
  detectCapabilities,
  resolveScanMarket,
  scanValuation,
  type ActivityTx,
} from "../src/server/sync/intelligence/scanIntel";

const NOW = 1_789_300_000_000;
const H = (n: number) => NOW - n * 3_600_000;

describe("ERC-20 capability detection (bytecode-selector evidence)", () => {
  // A bytecode containing the mint selector but not pause/blacklist.
  const code = "0x6080604052" + "40c10f19" + "6080604053";
  it("DETECTED when the selector is present in runtime bytecode", () => {
    const caps = detectCapabilities(code);
    expect(caps.mintable).toBe("DETECTED");
    expect(caps.pausable).toBe("NOT DETECTED");
    expect(caps.blacklist).toBe("NOT DETECTED");
    expect(caps.upgradeable).toBe("NOT DETECTED");
  });
  it("UNKNOWN without bytecode — never assumed impossible", () => {
    const caps = detectCapabilities(null);
    expect(caps.mintable).toBe("UNKNOWN");
    expect(caps.pausable).toBe("UNKNOWN");
    expect(caps.blacklist).toBe("UNKNOWN");
    expect(caps.upgradeable).toBe("UNKNOWN");
    expect(caps.basis).toContain("cannot be proven");
  });
});

describe("contract age", () => {
  it("calculates age from the deployment timestamp", () => {
    expect(contractAge(NOW - 23 * 86_400_000, NOW)?.label).toBe("23 days");
    expect(contractAge(NOW, NOW)?.label).toBe("today");
  });
  it("is null when deployment info is unavailable", () => {
    expect(contractAge(null, NOW)).toBeNull();
    expect(contractAge(NOW + 1, NOW)).toBeNull(); // future timestamp invalid
  });
});

describe("scan market resolution", () => {
  const price = {
    price: 232.12,
    bid: 231.9,
    ask: 232.34,
    high: 245.98,
    low: 218.25,
    change24hPct: 6.33,
    volume24h: 89_060_140,
    halted: false,
    updatedAt: NOW - 8_000,
    source: "Robinhood Stock Token API",
  };
  const known = { symbol: "NVDA", verified: true, tradingCapabilities: ["day"], multiplier: 1 };

  it("resolves a full verified quote for an indexed stock token", () => {
    const m = resolveScanMarket({ known, price, now: NOW, freshnessMs: 120_000 });
    expect(m?.price).toBe(232.12);
    expect(m?.bid).toBe(231.9);
    expect(m?.ask).toBe(232.34);
    expect(m?.spreadPct).toBeCloseTo(((232.34 - 231.9) / 232.12) * 100, 6);
    expect(m?.high24h).toBe(245.98);
    expect(m?.low24h).toBe(218.25);
    expect(m?.volume24h).toBe(89_060_140);
    expect(m?.freshness).toBe("live"); // 8s old
    expect(m?.source).toBe("Robinhood Stock Token API");
  });

  it("market status derives from capabilities + halt", () => {
    const m = resolveScanMarket({ known, price, now: NOW, freshnessMs: 120_000 });
    expect(["MARKET OPEN", "CLOSED", "EXTENDED HOURS", "OVERNIGHT", "HALTED"]).toContain(m?.tradingStatus);
    const halted = resolveScanMarket({ known, price: { ...price, halted: true }, now: NOW, freshnessMs: 120_000 });
    expect(halted?.tradingStatus).toBe("HALTED");
  });

  it("STALE: quote older than the freshness window is marked stale, not live", () => {
    const m = resolveScanMarket({ known, price: { ...price, updatedAt: NOW - 600_000 }, now: NOW, freshnessMs: 120_000 });
    expect(m?.freshness).toBe("stale");
  });

  it("UNAVAILABLE MARKET: unknown contract → null (renders 'Market data unavailable', never $0)", () => {
    expect(resolveScanMarket({ known: null, price: null, now: NOW, freshnessMs: 120_000 })).toBeNull();
    expect(
      resolveScanMarket({
        known: { symbol: null, verified: false, tradingCapabilities: null, multiplier: 1 },
        price: { ...price, price: 0 },
        now: NOW,
        freshnessMs: 120_000,
      }),
    ).toBeNull();
  });
});

describe("scan valuation — market cap / FDV provenance", () => {
  it("FDV = on-chain totalSupply() × live price, with the documented basis", () => {
    const v = scanValuation({ price: 742.375, verifiedCirculating: null, registryMarketCap: null, onChainTotalSupply: 32_760.347 });
    expect(v.fdv).toBeCloseTo(742.375 * 32_760.347, 4);
    expect(v.fdvBasis).toContain("On-chain totalSupply()");
  });
  it("CRITICAL: market cap stays null without verified circulating supply — total is never substituted", () => {
    const v = scanValuation({ price: 742.375, verifiedCirculating: null, registryMarketCap: null, onChainTotalSupply: 32_760.347 });
    expect(v.marketCap).toBeNull();
    expect(v.marketCapVerified).toBeNull();
  });
  it("market cap uses the verified registry circulating market cap when present", () => {
    const v = scanValuation({ price: 232.12, verifiedCirculating: null, registryMarketCap: 22_240_000, onChainTotalSupply: 100_000 });
    expect(v.marketCap).toBe(22_240_000);
    expect(v.marketCapSource).toContain("verified circulating market cap");
    expect(v.marketCapVerified).toBe(true);
  });
  it("FDV is null without a verified price or total supply", () => {
    expect(scanValuation({ price: null, verifiedCirculating: null, registryMarketCap: null, onChainTotalSupply: 100 }).fdv).toBeNull();
    expect(scanValuation({ price: 10, verifiedCirculating: null, registryMarketCap: null, onChainTotalSupply: null }).fdv).toBeNull();
  });
});

describe("transfer activity aggregation", () => {
  const txs: ActivityTx[] = [
    { ts: H(1), action: "buy", amount: 10, usd: 500, hash: "0xa", wallet: "0xw1", counterparty: null },
    { ts: H(2), action: "sell", amount: 4, usd: 200, hash: "0xb", wallet: "0xw2", counterparty: null },
    { ts: H(3), action: "buy", amount: 2, usd: 100, hash: "0xc", wallet: "0xw1", counterparty: null },
    { ts: H(30), action: "transfer", amount: 1, usd: 50, hash: "0xd", wallet: "0xw3", counterparty: null }, // outside 24h
  ];

  it("counts 24h transfers, unique wallets, and classified buys/sells", () => {
    const a = aggregateActivity(txs, NOW);
    expect(a.transfers24h).toBe(3);
    expect(a.uniqueWallets24h).toBe(2);
    expect(a.classified).toBe(true);
    expect(a.buyTransfers).toBe(2);
    expect(a.sellTransfers).toBe(1);
    expect(a.netFlowUsd).toBe(400); // 600 - 200
    expect(a.latest?.hash).toBe("0xa");
    expect(a.largest?.hash).toBe("0xa");
    expect(a.recent.length).toBe(3);
  });

  it("raw transfer rows are NOT reinterpreted as buys/sells", () => {
    const raw: ActivityTx[] = [
      { ts: H(1), action: "transfer", amount: 10, usd: 500, hash: "0xa", wallet: "0xw1", counterparty: null },
    ];
    const a = aggregateActivity(raw, NOW);
    expect(a.classified).toBe(false);
    expect(a.buyTransfers).toBeNull();
    expect(a.sellTransfers).toBeNull();
    expect(a.netFlowUsd).toBeNull();
    expect(a.transfers24h).toBe(1);
  });

  it("empty window → nulls, never zeros", () => {
    const a = aggregateActivity([], NOW);
    expect(a.transfers24h).toBeNull();
    expect(a.uniqueWallets24h).toBeNull();
    expect(a.latest).toBeNull();
  });
});