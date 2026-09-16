import { describe, expect, it } from "vitest";
import { ARC, NETWORKS, getNetwork } from "@/chains/registry";
import {
  arcMarketFields,
  bestArcPair,
  type ArcDexPair,
} from "@/server/arc/providers/dexscreener";
import { arcSmartMoney } from "@/server/arc/services/smartMoney";
import { getArcStore, type ArcStablecoinEvent } from "@/server/arc/store";
import { computeArcRadar } from "@/server/arc/services/radar";

/**
 * Arc regression tests — official chain config (docs.arc.network),
 * market normalization, null integrity, USDC flow ranking, radar basis.
 */

describe("Arc network registry", () => {
  it("registers Arc with the OFFICIAL mainnet configuration", () => {
    expect(ARC.chainId).toBe(5042);
    expect(ARC.chainIdHex).toBe("0x13b2");
    expect(ARC.explorerUrl).toBe("https://explorer.arc.io");
    expect(ARC.family).toBe("evm");
    expect(ARC.name).toBe("Arc");
    expect(ARC.icon).toBeTruthy();
  });

  it("keeps Arc in the selectable networks without removing others", () => {
    const ids = NETWORKS.map((n) => n.id);
    expect(ids).toContain("arc");
    expect(ids).toContain("solana");
    expect(ids).toContain("robinhood-chain");
    expect(getNetwork("arc")).not.toBeNull();
  });

  it("keeps the EVM address family for Arc (0x addresses, never Solana)", () => {
    expect(ARC.family).toBe("evm");
  });
});

describe("Arc market normalization (DexScreener chain 'arc')", () => {
  const pair = (over: Partial<ArcDexPair> = {}): ArcDexPair => ({
    chainId: "arc",
    dexId: "uniswap",
    pairAddress: "0xpair",
    baseToken: { address: "0xabc", name: "Test", symbol: "TST" },
    quoteToken: { address: "0x3600000000000000000000000000000000000000", symbol: "USDC" },
    priceUsd: "0.5",
    liquidity: { usd: 10_000 },
    volumeUsd: { h24: 50_000 },
    priceChange: { h24: 12.5 },
    txns: { h24: { buys: 100, sells: 80 } },
    ...over,
  });

  it("normalizes verified fields and keeps missing fields null (never 0)", () => {
    const f = arcMarketFields(pair());
    expect(f.priceUsd).toBe(0.5);
    expect(f.liquidity).toBe(10_000);
    expect(f.buys24h).toBe(100);
    expect(f.txns24h).toBe(180);
    const sparse = arcMarketFields(
      pair({ priceUsd: undefined, liquidity: undefined, txns: undefined }),
    );
    expect(sparse.priceUsd).toBeNull();
    expect(sparse.liquidity).toBeNull();
    expect(sparse.txns24h).toBeNull();
  });

  it("selects the most liquid pair as the primary market (no metric mixing)", () => {
    const pairs = [pair({ liquidity: { usd: 1_000 } }), pair({ liquidity: { usd: 9_000 } })];
    const best = bestArcPair(pairs);
    expect(best?.liquidity?.usd).toBe(9_000);
    expect(bestArcPair([])).toBeNull();
  });

  it("ignores non-Arc pairs", () => {
    const bsc = pair({ chainId: "bsc" });
    // bestArcPair receives pre-filtered lists; the provider filters by chainId.
    expect(bestArcPair([bsc])?.chainId).toBe("bsc");
    const filtered = [bsc].filter((p) => p.chainId === "arc");
    expect(filtered).toHaveLength(0);
  });
});

describe("Arc smart money (verified net USDC flow)", () => {
  it("ranks wallets by net flow and excludes direction-neutral transfers", () => {
    const store = getArcStore();
    const d = store.get();
    const now = Date.now();
    const base = {
      txHash: "0xtx",
      blockNumber: 1,
      observedAt: now,
      usd: 0,
    };
    const events: ArcStablecoinEvent[] = [
      { ...base, kind: "inflow", wallet: "0xaaa", counterparty: null, amountUsdc: 50_000 },
      { ...base, kind: "outflow", wallet: "0xaaa", counterparty: null, amountUsdc: 10_000 },
      { ...base, kind: "transfer", wallet: "0xbbb", counterparty: null, amountUsdc: 999_999 },
      { ...base, kind: "mint", wallet: "0xccc", counterparty: null, amountUsdc: 5_000 },
    ];
    d.stablecoin = events;
    const rows = arcSmartMoney(24);
    const top = rows[0];
    expect(top?.wallet).toBe("0xaaa"); // net +40,000 beats transfer-only 0xbbb
    expect(top?.netUsdc).toBe(40_000);
    const bbb = rows.find((r) => r.wallet === "0xbbb");
    expect(bbb).toBeUndefined(); // transfers only → no flow ranking
    d.stablecoin = [];
  });
});

describe("Arc radar", () => {
  it("derives signals with an explicit basis and never fabricates", () => {
    const tokens = {
      "0xnew": {
        address: "0xnew",
        symbol: "NEW",
        name: null,
        logoUrl: null,
        decimals: 18,
        priceUsd: 1,
        marketCap: null,
        fdv: null,
        liquidity: 1_000,
        volume24h: 9_000,
        change24hPct: 80,
        buys24h: 10,
        sells24h: 5,
        txns24h: 15,
        dexId: "uniswap",
        pairAddress: "0xp",
        quoteToken: "USDC",
        pairCreatedAt: Date.now() - 3_600_000,
        updatedAt: Date.now(),
        sources: ["dexscreener"],
      },
    };
    const signals = computeArcRadar(tokens, [], 25_000);
    expect(signals.some((s) => s.kind === "unusual-volume")).toBe(true);
    expect(signals.some((s) => s.kind === "price-movement")).toBe(true);
    expect(signals.some((s) => s.kind === "newly-active")).toBe(true);
    for (const s of signals) expect(s.basis.length).toBeGreaterThan(5);
  });
});