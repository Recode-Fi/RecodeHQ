import { describe, expect, it } from "vitest";
import { routeWalletLookup } from "@/lib/walletRouting";

const SOL_WALLET = "4DK7LaupE4pkvKoc9eZFLHZCgGRg8ZbfMiQr3yyPPJEm";
const EVM_WALLET = "0x7cdc246ff6d5b0f5b84c0e3a3bf7cbe5f2b1a900";

describe("wallet lookup routing (selected network × address family)", () => {
  it("routes base58 addresses to Solana only when Solana is selected", () => {
    expect(routeWalletLookup(SOL_WALLET, "solana")).toEqual({
      kind: "route",
      family: "solana",
      address: SOL_WALLET,
    });
  });

  it("rejects base58 addresses on EVM networks with a clean mismatch state", () => {
    for (const net of ["arc", "robinhood-chain"]) {
      const d = routeWalletLookup(SOL_WALLET, net);
      expect(d.kind).toBe("mismatch");
    }
  });

  it("routes EVM addresses on Arc and Robinhood, normalized to lowercase", () => {
    for (const net of ["arc", "robinhood-chain", "all"]) {
      const d = routeWalletLookup(EVM_WALLET, net);
      expect(d).toEqual({ kind: "route", family: "evm", address: EVM_WALLET.toLowerCase() });
    }
  });

  it("rejects EVM addresses when Solana is selected (never cross-family)", () => {
    const d = routeWalletLookup(EVM_WALLET, "solana");
    expect(d.kind).toBe("mismatch");
  });

  it("marks malformed input invalid", () => {
    expect(routeWalletLookup("not-an-address", "solana").kind).toBe("invalid");
    expect(routeWalletLookup("0x123", "arc").kind).toBe("invalid");
  });
});