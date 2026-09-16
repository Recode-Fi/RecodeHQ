import { describe, expect, it } from "vitest";
import {
  mapRecodePairs,
  DEXSCREENER_CHAIN_TO_ID,
} from "@/server/sync/recodeTokenResolver";

/**
 * $RECODE token resolver — direct contract-address lookup integrity:
 * exact base match, chain verification, null-safe fields, best pair.
 */

const RECODE = "0xrecodewithchecksum0000000000000000000001".toLowerCase();

function pair(over: Record<string, unknown> = {}) {
  return {
    chainId: "robinhood",
    dexId: "uniswap",
    pairAddress: "0xp",
    baseToken: { address: RECODE, symbol: "RECODE", name: "RECODE" },
    quoteToken: { address: "0xusdc", symbol: "USDC" },
    priceUsd: "0.25",
    priceChange: { h24: 12.5 },
    marketCap: 1_000_000,
    fdv: 2_000_000,
    volumeUsd: { h24: 85_000 },
    liquidity: { usd: 250_000 },
    info: { imageUrl: "https://logo.example/recode.png" },
    ...over,
  } as Parameters<typeof mapRecodePairs>[0][number];
}

describe("$RECODE direct contract resolution", () => {
  it("maps the exact-match best pair into a full live snapshot", () => {
    const m = mapRecodePairs([pair()], RECODE);
    expect(m).not.toBeNull();
    expect(m?.priceUsd).toBe(0.25);
    expect(m?.change24hPct).toBe(12.5);
    expect(m?.marketCap).toBe(1_000_000);
    expect(m?.volume24h).toBe(85_000);
    expect(m?.liquidityUsd).toBe(250_000);
    expect(m?.symbol).toBe("RECODE");
    expect(m?.chainId).toBe(4663); // DexScreener "robinhood" → registry 4663
    expect(m?.pairsTotal).toBe(1);
  });

  it("EXCLUDES quote-side pairs (never attaches another token's market)", () => {
    const other = pair({
      baseToken: { address: "0xargus", symbol: "ARGUS" },
      liquidity: { usd: 99_999_999 },
    });
    const m = mapRecodePairs([other, pair({ liquidity: { usd: 10 } })], RECODE);
    // Only the exact-base pair counts — the huge ARGUS pair is ignored.
    expect(m?.priceUsd).toBe(0.25);
    expect(m?.liquidityUsd).toBe(10);
  });

  it("selects the most liquid exact pair (multiple pairs, no metric mixing)", () => {
    const m = mapRecodePairs(
      [pair({ pairAddress: "0xa", liquidity: { usd: 5_000 } }), pair({ pairAddress: "0xb", liquidity: { usd: 50_000 } })],
      RECODE,
    );
    expect(m?.pairsTotal).toBe(2);
    expect(m?.liquidityUsd).toBe(50_000);
  });

  it("maps deployment chains via DexScreener chain id", () => {
    expect(DEXSCREENER_CHAIN_TO_ID.robinhood).toBe(4663);
    expect(DEXSCREENER_CHAIN_TO_ID.ethereum).toBe(1);
    expect(DEXSCREENER_CHAIN_TO_ID.bsc).toBe(56);
    expect(DEXSCREENER_CHAIN_TO_ID.arbitrum).toBe(42161);
    expect(DEXSCREENER_CHAIN_TO_ID.arc).toBe(5042);
    const other = mapRecodePairs([pair({ chainId: "ethereum" })], RECODE);
    expect(other?.chainId).toBe(1); // real deployment chain, honestly reported
    expect(other?.dexscreenerChain).toBe("ethereum");
  });

  it("reports unmapped dexscreener chains raw (no configured-chain fallback)", () => {
    const m = mapRecodePairs([pair({ chainId: "polygon" })], RECODE);
    expect(m?.chainId).toBeNull(); // not in registry — never misattributed
    expect(m?.dexscreenerChain).toBe("polygon");
  });

  it("returns null when no exact-base pair exists (no cross-chain fallback)", () => {
    const other = pair({ baseToken: { address: "0xnotrecode", symbol: "X" } });
    expect(mapRecodePairs([other], RECODE)).toBeNull();
    expect(mapRecodePairs([], RECODE)).toBeNull();
  });

  it("null-safe: omitted provider fields stay null (never 0)", () => {
    const m = mapRecodePairs(
      [pair({ priceUsd: undefined, marketCap: undefined, volumeUsd: undefined, liquidity: undefined, priceChange: undefined })],
      RECODE,
    );
    expect(m?.priceUsd).toBeNull();
    expect(m?.marketCap).toBeNull();
    expect(m?.volume24h).toBeNull();
    expect(m?.liquidityUsd).toBeNull();
    expect(m?.change24hPct).toBeNull();
  });
});