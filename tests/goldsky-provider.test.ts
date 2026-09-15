import { describe, afterEach, expect, it, vi } from "vitest";
import { GoldskyTokenIntelligence } from "../src/server/sync/providers/goldsky";
import { BlockscoutTokenIntelligence } from "../src/server/sync/intelligence/tokenIntelligence";
import { getSyncStore } from "../src/server/sync/store";
import { resolveHolders } from "../src/server/sync/intelligence/tokenIntelligence";

const ENDPOINT = "https://api.goldsky.com/api/public/project_test/subgraphs/recode/1.0.0/gn";
const TOKEN = "0x" + "11".repeat(20);
const NOW = Date.now();

function mockFetchOnce(payload: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoldskyTokenIntelligence — GraphQL normalization", () => {
  it("holders: balances normalize, sharePct derives from indexed total supply", async () => {
    mockFetchOnce({
      data: {
        token: { id: TOKEN, totalSupply: "1000", holderCount: "2" },
        tokenBalances: [
          { account: { id: "0x" + "a".repeat(40) }, value: "700" },
          { account: { id: "0x" + "b".repeat(40) }, value: "300" },
        ],
      },
    });
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    const rows = await p.getHolders(TOKEN);
    expect(rows).not.toBeNull();
    expect(rows?.total).toBe(2);
    expect(rows?.rows[0]?.balance).toBe(700);
    expect(rows?.rows[0]?.sharePct).toBeCloseTo(70, 6);
    expect(rows?.rows[1]?.sharePct).toBeCloseTo(30, 6);
    expect(rows?.provenance.source).toBe("goldsky-subgraph");
    expect(rows?.provenance.verified).toBe(true); // chain-verified reconstruction
  });

  it("malformed holders response → null (app falls back)", async () => {
    mockFetchOnce({ data: { token: null, tokenBalances: [] } });
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    expect(await p.getHolders(TOKEN)).toBeNull();
  });

  it("GraphQL errors surface as failures (trigger the fallback chain)", async () => {
    mockFetchOnce({ errors: [{ message: "indexed to block X, not ready" }] });
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    await expect(p.getHolders(TOKEN)).rejects.toThrow("indexed to block X");
  });

  it("HTTP failure (e.g. 403/429-style) throws — never fabricated data", async () => {
    mockFetchOnce({ data: null }, false);
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    await expect(p.getHolders(TOKEN)).rejects.toThrow("HTTP 500");
  });

  it("transfers: raw indexed events — USD stays null, timestamp converted to ms", async () => {
    mockFetchOnce({
      data: {
        transferEvents: [
          {
            id: "0xhash-1",
            from: { id: "0x" + "1".repeat(40) },
            to: { id: "0x" + "2".repeat(40) },
            value: "50",
            timestamp: String(Math.floor(NOW / 1000)),
            txHash: "0xhash",
          },
        ],
      },
    });
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    const rows = await p.getTransfers(TOKEN, 10);
    expect(rows?.[0]?.amount).toBe(50);
    expect(rows?.[0]?.usd).toBeNull(); // never relabeled as a trade value
    expect(rows?.[0]?.ts).toBe(Math.floor(NOW / 1000) * 1000);
  });

  it("token supply: indexed total supply is NOT relabeled as circulating", async () => {
    mockFetchOnce({ data: { token: { totalSupply: "1000" } } });
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    const s = await p.getTokenSupply(TOKEN, 18);
    expect(s?.totalSupplyRaw).toBe("1000");
    expect(s?.circulatingSupply).toBeNull();
  });

  it("provider health exposes role/url/state", () => {
    const p = new GoldskyTokenIntelligence(ENDPOINT);
    const h = p.health();
    expect(h.provider).toBe("goldsky-subgraph");
    expect(h.role).toBe("primary");
    expect(h.url).toBe(ENDPOINT);
  });
});

describe("fallback chain with Goldsky as primary", () => {
  it("primary GraphQL failure falls through to Blockscout adapter", async () => {
    // primary fails (HTTP error)
    let call = 0;
    const fn = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 403, json: async () => ({ errors: [{ message: "forbidden" }] }) };
      }
      // blockscout-style calls (unused in this assertion)
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    });
    vi.stubGlobal("fetch", fn);

    const goldsky = new GoldskyTokenIntelligence(ENDPOINT);
    const blockscout = new BlockscoutTokenIntelligence(
      { holders: async () => [{ address: "0x" + "c".repeat(40), valueRaw: "1000000000000000000" }], tokenDetail: async () => ({ holders: 1, volume24h: null, exchangeRate: null, totalSupplyRaw: "1000000000000000000", decimals: 18, txCount: null }) } as never,
      () => 18,
    );
    const outcome = await resolveHolders(goldsky, blockscout, getSyncStore(), TOKEN, 1, 300_000);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("blockscout-fallback");
      expect(outcome.data.rows[0]?.balance).toBe(1);
    }
  });
});