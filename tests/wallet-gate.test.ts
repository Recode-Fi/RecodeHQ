import { describe, expect, it } from "vitest";
import { gateStatus, networkFamily, isGateNetwork } from "@/lib/gate";

const EVM = "0x7cdc246ff6d5b0f5b84c0e3a3bf7cbe5f2b1a900";
const SOL = "4DK7LaupE4pkvKoc9eZFLHZCgGRg8ZbfMiQr3yyPPJEm";
const mounted = { mounted: true, evmAddress: null, solAddress: null };

describe("wallet gate status", () => {
  it("returns checking while providers hydrate", () => {
    expect(gateStatus({ mounted: false, selected: "solana", evmAddress: null, solAddress: null }).kind).toBe("checking");
  });

  it("requires a specific network (All Networks is not a gate network)", () => {
    expect(gateStatus({ ...mounted, selected: "all" }).kind).toBe("select-network");
  });

  it("asks to connect when nothing is connected", () => {
    for (const net of ["solana", "arc", "robinhood-chain", "ethereum", "bsc", "arbitrum"]) {
      const s = gateStatus({ ...mounted, selected: net });
      expect(s.kind).toBe("connect");
    }
    expect(gateStatus({ ...mounted, selected: "solana" })).toEqual({ kind: "connect", family: "solana" });
    expect(gateStatus({ ...mounted, selected: "ethereum" })).toEqual({ kind: "connect", family: "evm" });
  });

  it("becomes ready with a compatible wallet", () => {
    expect(gateStatus({ mounted: true, selected: "solana", evmAddress: null, solAddress: SOL }).kind).toBe("ready");
    for (const net of ["ethereum", "bsc", "arbitrum", "arc", "robinhood-chain"]) {
      expect(gateStatus({ mounted: true, selected: net, evmAddress: EVM, solAddress: null }).kind).toBe("ready");
    }
  });

  it("reports a mismatch instead of silently switching networks", () => {
    const s1 = gateStatus({ mounted: true, selected: "solana", evmAddress: EVM, solAddress: null });
    expect(s1.kind).toBe("mismatch");
    expect((s1 as { message: string }).message).toContain("Solana wallet");
    const s2 = gateStatus({ mounted: true, selected: "arc", evmAddress: null, solAddress: SOL });
    expect(s2.kind).toBe("mismatch");
    expect((s2 as { message: string }).message).toContain("EVM wallet");
  });

  it("validates network families and membership", () => {
    expect(networkFamily("solana")).toBe("solana");
    expect(networkFamily("bsc")).toBe("evm");
    expect(networkFamily("all")).toBeNull();
    expect(isGateNetwork("arbitrum")).toBe(true);
    expect(isGateNetwork("")).toBe(false);
  });
});