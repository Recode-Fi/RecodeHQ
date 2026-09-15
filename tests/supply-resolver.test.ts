import { describe, expect, it } from "vitest";
import {
  fdvOf,
  marketCapFromCirculating,
  normalizeSupplyRaw,
  resolveSupply,
  type SupplyCandidate,
} from "../src/server/sync/intelligence/supply";

const NOW = 1_700_000_000_000;

describe("normalizeSupplyRaw", () => {
  it("normalizes raw on-chain values with decimals", () => {
    expect(normalizeSupplyRaw("1000000000000000000", 18)).toBe(1);
    expect(normalizeSupplyRaw("55000000", 0)).toBe(55_000_000);
    expect(normalizeSupplyRaw("0xde0b6b3a7640000", 18)).toBe(1); // 1e18 raw = 1 whole token
  });
  it("rejects zero/negative/malformed supply", () => {
    expect(normalizeSupplyRaw("0", 18)).toBeNull();
    expect(normalizeSupplyRaw("abc", 18)).toBeNull();
    expect(normalizeSupplyRaw(null, 18)).toBeNull();
  });
});

describe("resolveSupply — verified supply hierarchy", () => {
  it("prefers the official registry over chain/indexer candidates", () => {
    const candidates: SupplyCandidate[] = [
      { kind: "chain-indexer", source: "robinhood-indexer", totalSupply: 999, updatedAt: NOW },
      { kind: "official-registry", source: "robinhood-explorer-registry", totalSupplyRaw: "1000000", decimals: 0, updatedAt: NOW },
    ];
    const r = resolveSupply(candidates, 10, NOW);
    expect(r.kind).toBe("official-registry");
    expect(r.source).toBe("robinhood-explorer-registry");
    expect(r.totalSupply).toBe(1_000_000);
    expect(r.verified).toBe(true);
    expect(r.confidence).toBe(1);
  });

  it("falls through to chain-indexer when no registry candidate resolves", () => {
    const r = resolveSupply(
      [{ kind: "chain-indexer", source: "robinhood-indexer", totalSupplyRaw: "0x8ac7230489e80000", decimals: 18, updatedAt: NOW }],
      5,
      NOW,
    );
    expect(r.kind).toBe("chain-indexer");
    expect(r.totalSupply).toBe(10); // 1e19 raw ÷ 1e18 decimals
    // chain/indexer supply IS chain data → chain-verified, but lower confidence
    expect(r.verified).toBe(true);
    expect(r.confidence).toBe(0.7);
  });

  it("uses verified circulating supply when the source provides it", () => {
    const r = resolveSupply(
      [{ kind: "official-registry", source: "official", totalSupply: 1_000_000, circulatingSupply: 850_000, updatedAt: NOW }],
      10,
      NOW,
    );
    expect(r.circulatingSupply).toBe(850_000);
    expect(r.circulatingBasis).toContain("verified circulating supply");
  });

  it("derives circulating supply ONLY from a verified circulating market cap ÷ price", () => {
    const r = resolveSupply(
      [
        {
          kind: "official-registry",
          source: "robinhood-explorer-registry",
          totalSupply: 1_000_000,
          circulatingMarketCap: 8_500_000, // verified circulating mcap
          updatedAt: NOW,
        },
      ],
      100, // verified price
      NOW,
    );
    expect(r.circulatingSupply).toBeCloseTo(85_000, 6);
    expect(r.circulatingBasis).toContain("derived");
    expect(r.circulatingBasis).toContain("verified circulating market cap ÷ verified price");
  });

  it("CRITICAL: never relabels total supply as circulating supply", () => {
    const r = resolveSupply(
      [{ kind: "chain-indexer", source: "robinhood-indexer", totalSupply: 10_000_000, updatedAt: NOW }],
      5,
      NOW,
    );
    expect(r.totalSupply).toBe(10_000_000);
    expect(r.circulatingSupply).toBeNull(); // ← the invariant
    expect(r.circulatingBasis).toBeNull();
  });

  it("returns unavailable (nulls) when no candidate resolves", () => {
    const r = resolveSupply([], 10, NOW);
    expect(r.totalSupply).toBeNull();
    expect(r.circulatingSupply).toBeNull();
    expect(r.verified).toBe(false);
    expect(r.provenance.freshness).toBe("unavailable");
    expect(r.provenance.source).toBe("unavailable");
  });

  it("carries source metadata: source, verified, confidence, updatedAt", () => {
    const r = resolveSupply(
      [{ kind: "contract-metadata", source: "rpc-contract-metadata", totalSupply: 500, updatedAt: NOW }],
      2,
      NOW,
    );
    expect(r.source).toBe("rpc-contract-metadata");
    expect(r.confidence).toBe(0.8);
    expect(r.updatedAt).toBe(NOW);
    expect(r.provenance.provider).toBe("supply-resolver");
  });
});

describe("FDV and market cap separation", () => {
  it("FDV = price × verified total supply", () => {
    expect(fdvOf(10, 1_000_000)).toBe(10_000_000);
  });
  it("FDV is null without a verified total supply", () => {
    expect(fdvOf(10, null)).toBeNull();
    expect(fdvOf(null, 1_000_000)).toBeNull();
  });
  it("market cap = price × VERIFIED circulating supply", () => {
    expect(marketCapFromCirculating(10, 850_000)).toBe(8_500_000);
  });
  it("CRITICAL: market cap stays null when circulating supply is unverified — total supply is never substituted", () => {
    expect(marketCapFromCirculating(10, null)).toBeNull();
  });
});