import { describe, expect, it, vi } from "vitest";
import { syncWhaleActivity, deriveFlowKinds, eventWallet } from "@/server/sync/whale/sync";
import type { SyncStore } from "@/server/sync/store";
import type { SyncMarket, SyncPrice } from "@/server/sync/types";
import type { WhaleActivityProvider, WhaleTransferEvent } from "@/server/sync/whale/types";

const H = (n: number) => 1_789_300_000_000 - n * 3_600_000;
const TOK = "0xtoken0000000000000000000000000000000000";

function event(over: Partial<WhaleTransferEvent>): WhaleTransferEvent {
  return {
    id: "0xhash1:1",
    hash: "0xhash1",
    ts: H(1),
    tsBasis: "block",
    from: "0xaaa0000000000000000000000000000000000001",
    to: "0xbbb0000000000000000000000000000000000002",
    fromName: null,
    toName: null,
    fromIsContract: false,
    toIsContract: false,
    amount: 100,
    symbol: "SPY",
    address: TOK,
    action: "transfer",
    actionBasis: null,
    source: "blockscout",
    method: null,
    ...over,
  };
}

type StoreFixture = Pick<SyncStore, "get" | "save">;
type StoreShape = ReturnType<SyncStore["get"]>;

function fixtureStore(
  shape: Partial<StoreShape> & {
    markets?: Record<string, SyncMarket>;
    prices?: Record<string, SyncPrice>;
  },
): StoreFixture {
  const base: StoreShape = {
    version: 1,
    markets: {},
    prices: {},
    priceHistory: {},
    candles: {},
    liquidity: {},
    liquidityHistory: {},
    holders: {},
    holderHistory: {},
    transactions: [],
    whales: [],
    wallets: {},
    discovery: [],
    underlyingMcaps: {},
    transferCursors: {},
    logos: {},
    underlyingMeta: {},
  };
  // The real store is a stable object mutated in place — mimic that.
  const state = { ...base, ...shape } as StoreShape;
  return { get: () => state, save: vi.fn() };
}

const provider = (events: WhaleTransferEvent[] | null): WhaleActivityProvider => ({
  name: "blockscout",
  getTransfers: async () => events,
});

const BASE_OPTS = {
  markets: [{ address: TOK, symbol: "SPY", decimals: 18 }],
  cycleIndex: 0,
  maxPerCycle: 3,
};

const TOK_MARKET: Record<string, SyncMarket> = {
  [TOK]: {
    address: TOK,
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust • Robinhood Token",
    decimals: 18,
    totalSupply: "0x0",
    circulatingSupply: null,
    tokenStandard: "ERC-20",
    tradingCapabilities: null,
    assetType: "tokenized-stock",
    underlying: "SPDR S&P 500 ETF Trust",
    underlyingSymbol: "SPY",
    underlyingAssetType: "equity",
    logoUrl: null,
    verified: true,
    multiplier: null,
    chainId: 4663,
    status: "active",
    firstSeen: 0,
    lastSynced: null,
    source: "registry",
  },
};

const PRICE: Record<string, SyncPrice> = {
  [TOK]: {
    address: TOK,
    symbol: "SPY",
    price: 700,
    bid: null,
    ask: null,
    halted: null,
    marketCap: null,
    change24hPct: null,
    change24hValue: null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    volume1h: null,
    volume24h: null,
    volume7d: null,
    buyVolume24h: null,
    sellVolume24h: null,
    avgTradeSize: null,
    updatedAt: 0,
    source: "test",
  },
};

describe("syncWhaleActivity — merge, reconcile, integrity", () => {
  it("inserts new verified events with source, basis and counterparty", async () => {
    const store = fixtureStore({ markets: TOK_MARKET, prices: PRICE });
    const r = await syncWhaleActivity(store, {
      ...BASE_OPTS,
      providers: [
        provider([
          event({
            id: "0xhash1:1",
            action: "buy",
            actionBasis: "DEX pool/router on the sending side (RamsesV3Pool)",
            fromIsContract: true,
          }),
        ]),
      ],
    });
    expect(r.added).toBe(1);
    const tx = store.get().transactions[0];
    expect(tx.action).toBe("buy");
    expect(tx.source).toBe("blockscout");
    expect(tx.basis).toContain("RamsesV3Pool");
    expect(tx.counterparty).toBe("0xaaa0000000000000000000000000000000000001");
    // USD = amount × verified price (CALCULATED)
    expect(tx.usd).toBe(70_000);
    expect(store.get().whales[0].kind).toBe("buy");
  });

  it("keeps USD null (never 0) when no verified price exists", async () => {
    const store = fixtureStore({ markets: TOK_MARKET });
    await syncWhaleActivity(store, {
      ...BASE_OPTS,
      providers: [provider([event({ id: "0xhash9:1", amount: 1_000_000 })])],
    });
    const tx = store.get().transactions[0];
    expect(tx.usd).toBeNull();
    // null USD must never become a whale event
    expect(store.get().whales.length).toBe(0);
  });

  it("eventWallet maps trades to the non-DEX side and transfers to the receiver", () => {
    expect(eventWallet(event({ action: "buy" })).wallet).toBe(event({}).to);
    expect(eventWallet(event({ action: "sell" })).wallet).toBe(event({}).from);
    expect(eventWallet(event({ action: "transfer" })).wallet).toBe(event({}).to);
  });
});

describe("syncWhaleActivity — upgrade path (priority reconciliation)", () => {
  const legacyTx = {
    id: "0xhash1:1",
    hash: "0xhash1",
    ts: H(1),
    wallet: "0xbbb0000000000000000000000000000000000002",
    action: "transfer" as const,
    amount: 100,
    usd: 70_000,
    symbol: "SPY",
    address: TOK,
    source: "rpc-getlogs",
    tsBasis: "ingest" as const,
  };

  function storeWithLegacy() {
    return fixtureStore({
      markets: TOK_MARKET,
      prices: PRICE,
      transactions: [legacyTx],
      whales: [
        {
          id: "0xhash1:1",
          ts: H(1),
          wallet: legacyTx.wallet,
          symbol: "SPY",
          address: TOK,
          kind: "transfer" as const,
          usd: 70_000,
          source: "rpc-getlogs",
          tsBasis: "ingest" as const,
        },
      ],
    });
  }

  const sellEvent = () =>
    event({
      id: "0xhash1:1",
      action: "sell",
      actionBasis: "DEX pool/router on the receiving side (RamsesV3Pool)",
      to: "0xbbb0000000000000000000000000000000000002",
      toName: "RamsesV3Pool",
      toIsContract: true,
    });

  it("upgrades an rpc-getlogs row when Blockscout re-observes the same id", async () => {
    const store = storeWithLegacy();
    const r = await syncWhaleActivity(store, {
      ...BASE_OPTS,
      providers: [provider([sellEvent()])],
    });
    expect(r.upgraded).toBe(1);
    expect(r.whalesUpgraded).toBe(1);
    const tx = store.get().transactions[0];
    expect(tx.action).toBe("sell");
    expect(tx.source).toBe("blockscout");
    expect(tx.wallet).toBe("0xaaa0000000000000000000000000000000000001"); // seller side
    expect(tx.tsBasis).toBe("block");
    expect(store.get().whales[0].kind).toBe("sell");
  });

  it("never downgrades: a lower-priority source cannot rewrite the verdict", async () => {
    const store = storeWithLegacy();
    await syncWhaleActivity(store, { ...BASE_OPTS, providers: [provider([sellEvent()])] });
    const r2 = await syncWhaleActivity(store, {
      ...BASE_OPTS,
      providers: [provider([event({ id: "0xhash1:1", action: "transfer" })])],
    });
    expect(r2.upgraded).toBe(0);
    expect(store.get().transactions[0].action).toBe("sell");
  });
});

describe("deriveFlowKinds — rule-based on verified direction", () => {
  const now = 1_789_300_000_000;
  const W1 = "0x1111000000000000000000000000000000000001";
  const W2 = "0x2222000000000000000000000000000000000002";
  const W3 = "0x3333000000000000000000000000000000000003";

  const tx = (over: Partial<Parameters<typeof deriveFlowKinds>[0][number]>) => ({
    id: "1",
    hash: "0x1",
    ts: H(1),
    wallet: W1,
    action: "transfer" as const,
    amount: 100,
    usd: 200_000,
    symbol: "SPY",
    address: TOK,
    counterparty: W2,
    source: "blockscout",
    tsBasis: "block" as const,
    ...over,
  });

  it("derives accumulation when inflow dominates ≥2:1 across ≥2 events", () => {
    const rows = deriveFlowKinds([tx({ id: "1" }), tx({ id: "2", counterparty: W3 })], now);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("accumulation");
    expect(rows[0].source).toBe("derived-direction");
    expect(rows[0].usd).toBe(400_000);
    expect(rows[0].basis).toContain("rule-based");
  });

  it("derives distribution when outflow dominates", () => {
    const rows = deriveFlowKinds([
      tx({ id: "1", wallet: W2, counterparty: W1 }),
      tx({ id: "2", wallet: W3, counterparty: W1 }),
    ], now);
    // W1 is the counterparty on both sends → distributed 400k
    expect(rows.some((r) => r.wallet === W1 && r.kind === "distribution")).toBe(true);
  });

  it("ignores events below the whale threshold and outside the window", () => {
    const rows = deriveFlowKinds([
      tx({ usd: 500 }),
      tx({ id: "2", ts: now - 48 * 3_600_000 }),
    ], now);
    expect(rows.length).toBe(0);
  });

  it("never derives from a single event", () => {
    const rows = deriveFlowKinds([tx({})], now);
    expect(rows.length).toBe(0);
  });
});


