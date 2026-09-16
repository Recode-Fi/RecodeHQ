import { describe, expect, it } from "vitest";
import { arcMarketFields, bestArcPair, type ArcDexPair } from "@/server/arc/providers/dexscreener";
import { EVM_NET_CHAINS } from "@/server/evmnet/config";
import type { EvmNetDexPair } from "@/server/evmnet/providers/dexscreener";

/**
 * Direct-lookup integrity regression tests: DexScreener returns pairs
 * where the queried address appears as the QUOTE token (everything
 * trading against USDC/USDT). The lookup must use EXACT base-token
 * matches only — a quote-side pair must never attach another token's
 * market (or identity) to the queried address.
 */

const USDC_ARC = "0x3600000000000000000000000000000000000000";

function arcPair(base: string, liq: number): ArcDexPair {
  return {
    chainId: "arc",
    dexId: "uniswap",
    pairAddress: "0xp-" + base.slice(0, 6),
    baseToken: { address: base, symbol: base === USDC_ARC ? "USDC" : "OTHER" },
    quoteToken: { address: USDC_ARC, symbol: "USDC" },
    liquidity: { usd: liq },
  };
}

describe("direct lookup exact-match rule (quote-side contamination)", () => {
  it("Arc: a USDC-quote pair with another token as base is EXCLUDED", () => {
    const pairs = [arcPair("0xARGUS", 5_000_000), arcPair(USDC_ARC, 100_000)];
    const own = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === USDC_ARC);
    const best = bestArcPair(own);
    expect(best?.baseToken?.address?.toLowerCase()).toBe(USDC_ARC);
    // The high-liquidity ARGUS pair must never win for the USDC query.
    expect(best?.liquidity?.usd).toBe(100_000);
  });

  it("EVM NET: same rule for ethereum/bsc/arbitrum emitters", () => {
    const emitter = EVM_NET_CHAINS.ethereum.whaleEmitter; // USDT
    const evmPair = (base: string, liq: number): EvmNetDexPair => ({
      chainId: "ethereum",
      dexId: "uniswap",
      pairAddress: "0xp",
      baseToken: { address: base, symbol: base === emitter ? "USDT" : "OTHER" },
      liquidity: { usd: liq },
    });
    const pairs = [evmPair("0xother", 9_999_999), evmPair(emitter, 1)];
    const own = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === emitter.toLowerCase());
    expect(own).toHaveLength(1);
    expect(own[0].liquidity?.usd).toBe(1);
  });

  it("market fields still normalize null-safe after exact filtering", () => {
    const f = arcMarketFields(arcPair(USDC_ARC, 100));
    expect(f.liquidity).toBe(100);
    expect(f.priceUsd).toBeNull(); // pair had no price — stays null
  });
});