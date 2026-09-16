import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * NO-AUTO-CONNECT regression: wallet providers must never establish a
 * wallet connection during page initialization. Connection begins ONLY
 * from an explicit user action (gate/modal click). These tests read the
 * provider sources and fail if auto-connect patterns reappear.
 */

const read = (f: string) => readFileSync(f, "utf8");

describe("no automatic wallet connection on page load", () => {
  it("EVM provider performs no passive eth_accounts/eth_requestAccounts restore", () => {
    const src = read("src/providers/wallet-provider.tsx");
    expect(src).not.toMatch(/method:\s*"eth_accounts"/);
    expect(src).not.toMatch(/method:\s*"eth_requestAccounts"/);
    // eth_requestAccounts is allowed ONLY inside the explicit click handler
    const effectBlock = src.slice(src.indexOf("useEffect("), src.indexOf("openWalletModal ="));
    expect(effectBlock).not.toMatch(/eth_requestAccounts|eth_accounts/);
    expect(effectBlock).not.toMatch(/\.connect\(/);
  });

  it("Solana provider performs no onlyIfTrusted/connect restore on mount", () => {
    const src = read("src/providers/solana-wallet-provider.tsx");
    expect(src).not.toMatch(/onlyIfTrusted:\s*true/);
    const effectBlock = src.slice(src.indexOf("useEffect("), src.indexOf("const connect ="));
    expect(effectBlock).not.toMatch(/\.connect\(/);
    expect(effectBlock).not.toMatch(/localStorage/);
    // Detection only: the mount effect lists installed wallets
    expect(effectBlock).toContain("installedSolanaWallets()");
  });

  it("no persisted wallet id is treated as auth anywhere", () => {
    for (const f of ["src/providers/wallet-provider.tsx", "src/providers/solana-wallet-provider.tsx", "src/components/gate/AppGate.tsx"]) {
      expect(read(f)).not.toMatch(/recode\.solWallet/);
    }
    const gate = read("src/components/gate/AppGate.tsx");
    // Access requires LIVE provider addresses, not stored state
    expect(gate).toMatch(/evm\.address/);
    expect(gate).toMatch(/sol\.address/);
  });

  it("providers declare connect only as user-action API (no effect invocation)", () => {
    for (const f of ["src/providers/wallet-provider.tsx", "src/providers/solana-wallet-provider.tsx"]) {
      const src = read(f);
      // Every .connect( call site must be inside a useCallback/handler,
      // never directly inside a useEffect body.
      const effects = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[?[\s\S]*?\}?\)/g) ?? [];
      for (const e of effects) expect(e).not.toMatch(/\.connect\(/);
    }
  });
});