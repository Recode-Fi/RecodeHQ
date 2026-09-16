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

  it("family access requires verification when the chain id is unknown", () => {
    // Strict rule: without a verifiable chain id, EVM access is NOT
    // granted silently — the gate shows the wrong-network/switch state
    // (eth_chainId is read at connect time, so this is a rare degraded case).
    for (const net of ["ethereum", "bsc", "arbitrum", "arc", "robinhood-chain"]) {
      expect(gateStatus({ mounted: true, selected: net, evmAddress: EVM, solAddress: null }).kind).toBe("wrong-network");
    }
  });

  it("verifies the EVM chain id against the selected network", () => {
    // MetaMask on Ethereum mainnet + Ethereum selected → ready
    expect(
      gateStatus({ mounted: true, selected: "ethereum", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x1" }).kind,
    ).toBe("ready");
    // Same wallet on BSC chain while Ethereum selected → wrong network
    const wrong = gateStatus({ mounted: true, selected: "ethereum", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x38" });
    expect(wrong.kind).toBe("wrong-network");
    expect((wrong as { targetName: string }).targetName).toBe("Ethereum");
    // Robinhood requires 0x1237
    expect(
      gateStatus({ mounted: true, selected: "robinhood-chain", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x1237" }).kind,
    ).toBe("ready");
    // Arc requires 0x13b2
    expect(
      gateStatus({ mounted: true, selected: "arc", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x13b2" }).kind,
    ).toBe("ready");
    // BSC requires 0x38 — wallet on Ethereum mainnet → wrong network
    expect(
      gateStatus({ mounted: true, selected: "bsc", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x1" }).kind,
    ).toBe("wrong-network");
    // Arbitrum requires 0xa4b1
    expect(
      gateStatus({ mounted: true, selected: "arbitrum", evmAddress: EVM, solAddress: null, evmChainIdHex: "0xa4b1" }).kind,
    ).toBe("ready");
    // Chain id is case-insensitive
    expect(
      gateStatus({ mounted: true, selected: "arbitrum", evmAddress: EVM, solAddress: null, evmChainIdHex: "0xA4B1" }).kind,
    ).toBe("ready");
    // Unknown chain id → cannot verify → wrong network (no silent grant)
    expect(
      gateStatus({ mounted: true, selected: "ethereum", evmAddress: EVM, solAddress: null, evmChainIdHex: null }).kind,
    ).toBe("wrong-network");
  });

  it("Solana family needs no EVM chain verification", () => {
    expect(
      gateStatus({ mounted: true, selected: "solana", evmAddress: null, solAddress: SOL, evmChainIdHex: "0x1" }).kind,
    ).toBe("ready");
  });

  it("family mismatch still outranks chain verification", () => {
    expect(gateStatus({ mounted: true, selected: "solana", evmAddress: null, solAddress: null, evmChainIdHex: "0x1" }).kind).toBe("connect");
    expect(gateStatus({ mounted: true, selected: "solana", evmAddress: EVM, solAddress: null, evmChainIdHex: "0x1" }).kind).toBe("mismatch");
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