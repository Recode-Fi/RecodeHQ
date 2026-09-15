import { describe, expect, it } from "vitest";
import { parseRhjAssets, parseRhjQuote } from "../src/server/sync/providers/robinhood";

const CHAIN_ID = 4663;
const ADDR_4663 = "0x1111111111111111111111111111111111111111";
const ADDR_OTHER = "0x2222222222222222222222222222222222222222";

/** Verified live response shape (docs.robinhood.com/chain/stock-token-apis). */
function quotePayload(overrides: Record<string, unknown> = {}) {
  return {
    quotes: [
      {
        tokenSymbol: "NVDA",
        deployments: [{ contractAddress: ADDR_4663, chainId: CHAIN_ID }],
        bid: "218.25",
        ask: "245.98",
        currency: "USD",
        dailyTradingVolume: "89060000",
        isTradingHalt: false,
        generatedAt: "2026-09-13T10:30:00.123456789Z",
        dailyHigh: "248.10",
        dailyLow: "215.00",
        ...overrides,
      },
    ],
  };
}

describe("parseRhjQuote — quote normalization", () => {
  it("maps documented fields; decimal strings become finite numbers", () => {
    const q = parseRhjQuote(quotePayload(), CHAIN_ID);
    expect(q).not.toBeNull();
    expect(q?.symbol).toBe("NVDA");
    expect(q?.address).toBe(ADDR_4663);
    expect(q?.bid).toBeCloseTo(218.25, 8);
    expect(q?.ask).toBeCloseTo(245.98, 8);
    expect(q?.mid).toBeCloseTo((218.25 + 245.98) / 2, 8); // midPrice = (bid+ask)/2
    expect(q?.volume24h).toBe(89_060_000);
    expect(q?.halted).toBe(false);
  });

  it("prefers the deployment on the configured chain (chainId is canonical identity)", () => {
    const q = parseRhjQuote(
      {
        quotes: [
          {
            tokenSymbol: "SPY",
            deployments: [
              { contractAddress: ADDR_OTHER, chainId: 1 },
              { contractAddress: ADDR_4663, chainId: CHAIN_ID },
            ],
            bid: "742.10",
            ask: "742.66",
          },
        ],
      },
      CHAIN_ID,
    );
    expect(q?.address).toBe(ADDR_4663);
  });

  it("trims nanosecond timestamp fractions to milliseconds", () => {
    const q = parseRhjQuote(quotePayload(), CHAIN_ID);
    expect(q?.timestamp).toBe(Date.parse("2026-09-13T10:30:00.123Z"));
  });

  it("one-sided quote falls back to the available side for mid", () => {
    const q = parseRhjQuote(quotePayload({ ask: null }), CHAIN_ID);
    expect(q?.bid).toBeCloseTo(218.25, 8);
    expect(q?.mid).toBeCloseTo(218.25, 8);
  });

  it("malformed / empty payloads degrade to null — never to 0", () => {
    expect(parseRhjQuote({}, CHAIN_ID)).toBeNull();
    expect(parseRhjQuote({ quotes: [] }, CHAIN_ID)).toBeNull();
    expect(parseRhjQuote({ quotes: [{}] }, CHAIN_ID)).toBeNull();
  });

  it("non-numeric bid/ask strings are dropped, not coerced", () => {
    const q = parseRhjQuote(quotePayload({ bid: "not-a-number", ask: "1e999" }), CHAIN_ID);
    expect(q?.bid).toBeNull();
    expect(q?.mid).toBeNull();
    expect(q?.volume24h).toBe(89_060_000); // unrelated fields still usable
  });

  it("halt state is preserved for HALTED status derivation", () => {
    const q = parseRhjQuote(quotePayload({ isTradingHalt: true }), CHAIN_ID);
    expect(q?.halted).toBe(true);
  });
});

describe("parseRhjAssets — registry normalization", () => {
  it("parses the documented asset fields", () => {
    const assets = parseRhjAssets({
      results: [
        {
          contract_address: ADDR_4663,
          tokenSymbol: "GLD",
          name: "SPDR Gold Shares • Robinhood Token",
          status: "active",
          corporate_action_multiplier: "1",
          logo: "https://example.com/gld.png",
          decimals: 18,
          tradingCapabilities: ["day", "extended"],
        },
      ],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      address: ADDR_4663,
      symbol: "GLD",
      multiplier: 1,
      tradingCapabilities: ["day", "extended"],
    });
  });

  it("tolerates capability objects with name/type keys", () => {
    const assets = parseRhjAssets({
      assets: [
        {
          contractAddress: ADDR_4663,
          symbol: "SGOV",
          tradingCapabilities: [{ name: "overnight" }, { type: "day" }],
        },
      ],
    });
    expect(assets[0].tradingCapabilities).toEqual(["overnight", "day"]);
  });

  it("skips rows without contract or symbol (identity = chainId + contract)", () => {
    const assets = parseRhjAssets({
      results: [{ symbol: "ORPHAN" }, { contract_address: ADDR_4663 }, "garbage"],
    });
    expect(assets).toHaveLength(0);
  });

  it("defaults missing capabilities to null — never assumed hours", () => {
    const assets = parseRhjAssets({
      results: [{ contract_address: ADDR_4663, symbol: "AAPL" }],
    });
    expect(assets[0].tradingCapabilities).toBeNull();
  });
});
