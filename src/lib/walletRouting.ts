import { addressFamily } from "./types";

/**
 * ============================================================
 * Wallet-lookup routing — selected network × address family
 * ============================================================
 * Pure decision logic (unit-tested): the global network selector
 * governs which wallet pipeline a lookup may use. Addresses are
 * never processed with another chain's logic, and a family/network
 * mismatch produces a clean state instead of foreign-chain data.
 */

export type WalletRoutingDecision =
  | { kind: "route"; family: "evm" | "solana"; address: string }
  | { kind: "invalid" }
  | { kind: "mismatch"; message: string };

/** Networks whose wallet pipeline is Solana (non-EVM family). */
export function isSolanaNetworkId(network: string): boolean {
  return network === "solana";
}

export function routeWalletLookup(
  raw: string,
  selectedNetwork: string,
): WalletRoutingDecision {
  const family = addressFamily(raw);
  if (!family) return { kind: "invalid" };

  if (family === "solana") {
    if (isSolanaNetworkId(selectedNetwork)) {
      return { kind: "route", family, address: raw };
    }
    return {
      kind: "mismatch",
      message:
        "This is a Solana (base58) address. Select the Solana network to inspect it with Solana Wallet Intelligence.",
    };
  }

  // EVM family: route within EVM networks; never into Solana.
  if (isSolanaNetworkId(selectedNetwork)) {
    return {
      kind: "mismatch",
      message:
        "This is an EVM (0x…) address. Select an EVM network (Arc or Robinhood Chain) to inspect it.",
    };
  }
  return { kind: "route", family, address: raw.toLowerCase() };
}
