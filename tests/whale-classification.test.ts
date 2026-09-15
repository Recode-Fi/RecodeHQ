import { describe, expect, it } from "vitest";
import {
  classifyTransfer,
  isBurnAddress,
  isDexName,
} from "@/server/sync/whale/classify";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("isDexName — DEX component detection", () => {
  it("detects known DEX component names", () => {
    expect(isDexName("RamsesV3Pool", true)).toBe(true);
    expect(isDexName("UniswapV2Pair", true)).toBe(true);
    expect(isDexName("SomeRouter", true)).toBe(true);
    expect(isDexName("swap-helper", true)).toBe(true);
  });

  it("rejects non-DEX contracts and EOAs", () => {
    expect(isDexName("RobinHoodSettler", true)).toBe(false);
    expect(isDexName("SPDR S&P 500 ETF Trust • Robinhood Token", true)).toBe(false);
    expect(isDexName("RamsesV3Pool", false)).toBe(false); // EOA with a name — never trusted
    expect(isDexName(null, true)).toBe(false);
  });
});

describe("classifyTransfer — BUY/SELL only with swap evidence", () => {
  it("labels a DEX→wallet transfer as BUY with proven basis", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: "RamsesV3Pool",
      toName: null,
      fromIsContract: true,
      toIsContract: false,
    });
    expect(r.action).toBe("buy");
    expect(r.basis).toContain("RamsesV3Pool");
  });

  it("labels a wallet→DEX transfer as SELL with proven basis", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: null,
      toName: "UniswapV2 USDC Pair",
      fromIsContract: false,
      toIsContract: true,
    });
    expect(r.action).toBe("sell");
    expect(r.basis).toContain("UniswapV2 USDC Pair");
  });

  it("never labels an ordinary EOA→EOA transfer as a trade", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: null,
      toName: null,
      fromIsContract: false,
      toIsContract: false,
    });
    expect(r.action).toBe("transfer");
    expect(r.basis).toBeNull();
  });

  it("never labels a settlement-contract flow as a trade", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: "RobinHoodSettler",
      toName: null,
      fromIsContract: true,
      toIsContract: false,
    });
    expect(r.action).toBe("transfer");
  });

  it("never labels DEX→DEX as a wallet trade", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: "RamsesV3Pool",
      toName: "RamsesRouter",
      fromIsContract: true,
      toIsContract: true,
    });
    expect(r.action).toBe("transfer");
  });

  it("corroborates the basis with a decoded swap method", () => {
    const r = classifyTransfer({
      from: A,
      to: B,
      fromName: "SomeVault",
      toName: null,
      fromIsContract: true,
      toIsContract: false,
      method: "swapExactTokensForTokens",
    });
    expect(r.action).toBe("buy");
    expect(r.basis).toContain("swapExactTokensForTokens");
  });

  it("never classifies transfers into burn addresses as buys", () => {
    const r = classifyTransfer({
      from: A,
      to: "0x000000000000000000000000000000000000dEaD",
      fromName: "RamsesV3Pool",
      toName: null,
      fromIsContract: true,
      toIsContract: false,
    });
    expect(r.action).toBe("transfer");
  });
});

describe("isBurnAddress", () => {
  it("detects canonical burn addresses case-insensitively", () => {
    expect(isBurnAddress("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isBurnAddress("0x000000000000000000000000000000000000DEAD")).toBe(true);
    expect(isBurnAddress(A)).toBe(false);
    expect(isBurnAddress(null)).toBe(false);
  });
});
