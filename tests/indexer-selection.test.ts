import { describe, expect, it } from "vitest";
import { createPrimaryIntelProvider } from "../src/server/sync/intelligence/tokenIntelligence";
import { IndexerProvider } from "../src/server/sync/providers/indexer";
import { holderConcentration, isBurnAddress, whaleExposure, type HolderEntry } from "../src/server/sync/intelligence/whale";

describe("provider selection", () => {
  it("selects the Goldsky subgraph when RECODE_GOLDSKY_SUBGRAPH_URL is set", () => {
    const indexer = new IndexerProvider("https://example-indexer.test");
    const p = createPrimaryIntelProvider("https://api.goldsky.com/api/public/project_x/subgraphs/recode/1.0.0/gn", indexer);
    expect(p).not.toBeNull();
    expect(p?.name).toBe("goldsky-subgraph");
    expect(p?.role).toBe("primary");
  });

  it("falls back to the REST indexer when Goldsky is not configured", () => {
    const indexer = new IndexerProvider("https://example-indexer.test");
    const p = createPrimaryIntelProvider(null, indexer);
    expect(p?.name).toBe("robinhood-indexer");
  });

  it("returns null (→ blockscout fallback) when neither is configured", () => {
    expect(createPrimaryIntelProvider(null, new IndexerProvider(null))).toBeNull();
  });

  it("ignores a malformed Goldsky URL rather than crashing", () => {
    expect(createPrimaryIntelProvider("not-a-url", new IndexerProvider(null))).toBeNull();
  });
});

describe("burn address handling (whales never include burns)", () => {
  const price = 100;
  const entries: HolderEntry[] = [
    { address: "0x0000000000000000000000000000000000000000", balance: 500_000, sharePct: 50 }, // mint pool
    { address: "0x000000000000000000000000000000000000dead", balance: 100_000, sharePct: 10 }, // burn
    { address: "0x" + "a".repeat(40), balance: 30_000, sharePct: 3 }, // real whale $3M
    { address: "0x" + "b".repeat(40), balance: 200, sharePct: 0.02 },
  ];

  it("isBurnAddress recognizes null/burn addresses case-insensitively", () => {
    expect(isBurnAddress("0x000000000000000000000000000000000000dEaD")).toBe(true);
    expect(isBurnAddress("0x" + "a".repeat(40))).toBe(false);
    expect(isBurnAddress(null)).toBe(false);
  });

  it("whale exposure excludes burned supply", () => {
    const e = whaleExposure(entries, price, 100_000);
    expect(e.count).toBe(1);
    expect(e.usd).toBe(3_000_000);
    expect(e.largest[0]?.address).toBe("0x" + "a".repeat(40));
  });

  it("burned share is provable from verified holder shares", () => {
    const burns = holderConcentration(
      entries.filter((e) => isBurnAddress(e.address)),
      100,
    );
    expect(burns?.value).toBeCloseTo(60, 2); // 50% + 10%
  });
});