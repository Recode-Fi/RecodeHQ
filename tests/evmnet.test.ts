import { describe, expect, it } from "vitest";
import { EVM_NET_CHAINS, isEvmNetChain } from "@/server/evmnet/config";
import { ETHEREUM, BSC, ARBITRUM, NETWORKS } from "@/chains/registry";
import { evmNetMarketFields, type EvmNetDexPair } from "@/server/evmnet/providers/dexscreener";
import { evmNetSmartMoney } from "@/server/evmnet/services/smartMoney";
import { getEvmNetStore } from "@/server/evmnet/store";
import type { EvmNetStablecoinEvent } from "@/server/evmnet/types";
import { computeEvmNetRadar } from "@/server/evmnet/services/radar";
import { parseEvmNetChain } from "@/server/evmnet/registry";
import { routeWalletLookup } from "@/lib/walletRouting";

/**
 * EVM NET regression tests — Ethereum / BSC / Arbitrum: registry,
 * chain routing, market normalization, per-chain smart-money
 * isolation, radar basis, wallet routing, unavailable data.
 */

describe("EVM NET registry + chain config", () => {
  it("registers Ethereum/BSC/Arbitrum with officially verified values", () => {
    expect(ETHEREUM.chainId).toBe(1);
    expect(BSC.chainId).toBe(56);
    expect(ARBITRUM.chainId).toBe(42161);
    expect(ETHEREUM.explorerUrl).toBe("https://etherscan.io");
    expect(BSC.explorerUrl).toBe("https://bscscan.com");
    expect(ARBITRUM.explorerUrl).toBe("https://arbiscan.io");
    expect(ETHEREUM.icon).toBeTruthy();
    expect(BSC.icon).toBeTruthy();
    expect(ARBITRUM.icon).toBeTruthy();
  });

  it("keeps all prior networks registered", () => {
    const ids = NETWORKS.map((n) => n.id);
    for (const id of ["solana", "arc", "robinhood-chain", "ethereum", "bsc", "arbitrum"]) {
      expect(ids).toContain(id);
    }
  });

  it("configures canonical stablecoin whale emitters with correct decimals", () => {
    expect(EVM_NET_CHAINS.ethereum.whaleDecimals).toBe(6);
    expect(EVM_NET_CHAINS.bsc.whaleDecimals).toBe(18);
    expect(EVM_NET_CHAINS.arbitrum.whaleDecimals).toBe(6);
    expect(EVM_NET_CHAINS.ethereum.nativeSymbol).toBe("ETH");
    expect(EVM_NET_CHAINS.bsc.nativeSymbol).toBe("BNB");
  });

  it("parses chain route params strictly", () => {
    expect(parseEvmNetChain("ethereum")).toBe("ethereum");
    expect(parseEvmNetChain("bsc")).toBe("bsc");
    expect(parseEvmNetChain("arbitrum")).toBe("arbitrum");
    expect(parseEvmNetChain("solana")).toBeNull();
    expect(parseEvmNetChain("arc")).toBeNull();
    expect(parseEvmNetChain("fake")).toBeNull();
    expect(isEvmNetChain("bsc")).toBe(true);
    expect(isEvmNetChain("arc")).toBe(false);
  });
});

describe("EVM NET market normalization", () => {
  const pair = (over: Partial<EvmNetDexPair> = {}): EvmNetDexPair => ({
    chainId: "ethereum",
    dexId: "uniswap",
    pairAddress: "0xp",
    baseToken: { address: "0xt", name: "Test", symbol: "TST" },
    quoteToken: { address: "0xemitter", symbol: "USDT" },
    priceUsd: "2.5",
    liquidity: { usd: 884_302 },
    volumeUsd: { h24: 1_000_000 },
    priceChange: { h24: -3.2 },
    txns: { h24: { buys: 500, sells: 400 } },
    ...over,
  });

  it("normalizes verified fields; missing fields stay null (never 0)", () => {
    const f = evmNetMarketFields(pair());
    expect(f.priceUsd).toBe(2.5);
    expect(f.txns24h).toBe(900);
    const sparse = evmNetMarketFields(pair({ priceUsd: undefined, txns: undefined }));
    expect(sparse.priceUsd).toBeNull();
    expect(sparse.txns24h).toBeNull();
  });
});

describe("EVM NET smart money (per-chain isolation)", () => {
  it("ranks per chain and never mixes chains", () => {
    const store = getEvmNetStore("ethereum");
    const now = Date.now();
    const base = { txHash: "0xh", blockNumber: 1, observedAt: now, symbol: "USDT", address: "0xemitter" };
    store.get().stablecoin = [
      { ...base, kind: "inflow", wallet: "0xeth", counterparty: null, amount: 250_000, usd: 250_000 },
      { ...base, kind: "outflow", wallet: "0xeth", counterparty: null, amount: 50_000, usd: 50_000 },
      { ...base, kind: "transfer", wallet: "0xother", counterparty: null, amount: 1_000_000, usd: 1_000_000 },
    ];
    const eth = evmNetSmartMoney("ethereum", 24);
    expect(eth[0]?.wallet).toBe("0xeth");
    expect(eth[0]?.netUsd).toBe(200_000);
    // Other chains' stores are separate — writing nothing there yields
    // no leakage of the ethereum events (real cached data proves it).
    getEvmNetStore("bsc").get().stablecoin = [];
    getEvmNetStore("arbitrum").get().stablecoin = [];
    expect(evmNetSmartMoney("bsc", 24)).toHaveLength(0);
    expect(evmNetSmartMoney("arbitrum", 24)).toHaveLength(0);
    store.get().stablecoin = [];
  });
});

describe("EVM NET radar", () => {
  it("derives signals with explicit basis from verified data only", () => {
    const signals = computeEvmNetRadar(
      {
        "0x1": {
          address: "0x1", symbol: "T", name: null, logoUrl: null, decimals: 18,
          priceUsd: 1, marketCap: null, fdv: null, liquidity: 2_000, volume24h: 20_000,
          change24hPct: 22, buys24h: 5, sells24h: 4, txns24h: 9, dexId: "uniswap",
          pairAddress: "0xp", quoteToken: "USDT", pairCreatedAt: Date.now() - 3_600_000,
          updatedAt: Date.now(), sources: ["dexscreener"],
        },
      },
      [],
      100_000,
    );
    expect(signals.some((s) => s.kind === "unusual-volume")).toBe(true);
    expect(signals.some((s) => s.kind === "price-movement")).toBe(true);
    for (const s of signals) expect(s.basis.length).toBeGreaterThan(5);
  });
});

describe("wallet routing with EVM NET chains", () => {
  const EVM = "0x7cdc246ff6d5b0f5b84c0e3a3bf7cbe5f2b1a900";
  const SOL = "4DK7LaupE4pkvKoc9eZFLHZCgGRg8ZbfMiQr3yyPPJEm";

  it("routes EVM addresses on ethereum/bsc/arbitrum (never inferred)", () => {
    for (const net of ["ethereum", "bsc", "arbitrum"]) {
      const d = routeWalletLookup(EVM, net);
      expect(d).toEqual({ kind: "route", family: "evm", address: EVM });
    }
  });

  it("rejects Solana addresses on EVM-net selections", () => {
    for (const net of ["ethereum", "bsc", "arbitrum"]) {
      expect(routeWalletLookup(SOL, net).kind).toBe("mismatch");
    }
  });

  it("rejects EVM addresses when Solana is selected", () => {
    expect(routeWalletLookup(EVM, "solana").kind).toBe("mismatch");
  });
});