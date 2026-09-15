import { describe, expect, it } from "vitest";
import { addressFamily, SOLANA_ADDRESS_RE } from "@/lib/types";
import { EVM_ADDRESS_RE } from "@/lib/format";

/**
 * Address-family routing — EVM (0x…, 42 hex chars) and Solana (base58,
 * 32–44 chars) must never be confused or cross-processed.
 */
describe("addressFamily", () => {
  const evm = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
  const solanaMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC mint
  const solanaWallet = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg";

  it("classifies EVM addresses", () => {
    expect(addressFamily(evm)).toBe("evm");
    expect(EVM_ADDRESS_RE.test(evm)).toBe(true);
  });

  it("classifies Solana mints and wallets", () => {
    expect(addressFamily(solanaMint)).toBe("solana");
    expect(addressFamily(solanaWallet)).toBe("solana");
    expect(SOLANA_ADDRESS_RE.test(solanaMint)).toBe(true);
  });

  it("keeps 0x addresses out of the Solana family", () => {
    expect(SOLANA_ADDRESS_RE.test(evm)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(addressFamily("")).toBeNull();
    expect(addressFamily("not-an-address")).toBeNull();
    expect(addressFamily("0x123")).toBeNull();
    expect(addressFamily("0x" + "g".repeat(40))).toBeNull();
  });

  it("never applies EVM-style normalization to base58 addresses", () => {
    // Lowercasing a base58 address changes its bytes — with strict 32-byte
    // decode validation a case-mangled address is (correctly) no longer a
    // valid Solana address, so family routing rejects it outright.
    const lower = solanaMint.toLowerCase();
    expect(lower).not.toBe(solanaMint);
    expect(addressFamily(lower)).toBeNull();
    expect(addressFamily("0X" + evm.slice(2))).toBeNull(); // 0X is not a valid EVM prefix
  });
});