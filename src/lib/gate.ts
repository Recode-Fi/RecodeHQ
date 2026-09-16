/**
 * ============================================================
 * Wallet gate — pure decision logic (unit-tested)
 * ============================================================
 * Access rule: one successful wallet connection compatible with the
 * selected network FAMILY (Solana / EVM), PLUS network-specific
 * verification for EVM: the wallet's current chain id must match the
 * selected network (explicit user-approved switch otherwise).
 * No automatic connections; networks never silently switch.
 */

export type GateNetwork =
  | "solana"
  | "ethereum"
  | "bsc"
  | "arbitrum"
  | "arc"
  | "robinhood-chain";

export type GateFamily = "solana" | "evm";

export type GateStatus =
  | { kind: "checking" }
  | { kind: "select-network" }
  | { kind: "connect"; family: GateFamily }
  | { kind: "mismatch"; message: string }
  | {
      kind: "wrong-network";
      family: "evm";
      targetHex: string;
      targetName: string;
      currentHex: string | null;
    }
  | { kind: "ready" };

/** Registry chain ids (hex) — keep in sync with src/chains/registry.ts. */
export const GATE_CHAIN_HEX: Record<Exclude<GateNetwork, "solana">, string> = {
  ethereum: "0x1",
  bsc: "0x38",
  arbitrum: "0xa4b1",
  arc: "0x13b2",
  "robinhood-chain": "0x1237",
};

export const GATE_CHAIN_NAME: Record<Exclude<GateNetwork, "solana">, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Smart Chain",
  arbitrum: "Arbitrum One",
  arc: "Arc",
  "robinhood-chain": "Robinhood Chain",
};

/** Address-family helper (mirrors lib/types addressFamily, gate-local). */
function familyOf(address: string | null): GateFamily | null {
  if (!address) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return "evm";
  // Base58 Solana public keys: 32–44 chars, no 0/I/l/O.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return null;
}

export function networkFamily(network: string): GateFamily | null {
  return network === "solana" ? "solana" : isGateNetwork(network) ? "evm" : null;
}

export function isGateNetwork(network: string): network is GateNetwork {
  return ["solana", "ethereum", "bsc", "arbitrum", "arc", "robinhood-chain"].includes(network);
}

/**
 * Decide the gate state.
 * mounted: providers hydrated (wallet connections restored).
 * selected: the global network selection ("all" → no specific chain).
 * evmAddress / solAddress: live provider addresses (either may be null).
 * evmChainIdHex: the connected EVM wallet's current chain id (live
 * from accountsChanged/chainChanged) — verified against the registry
 * for network-specific access on EVM networks.
 */
export function gateStatus(args: {
  mounted: boolean;
  selected: string;
  evmAddress: string | null;
  solAddress: string | null;
  evmChainIdHex?: string | null;
}): GateStatus {
  if (!args.mounted) return { kind: "checking" };
  if (!isGateNetwork(args.selected)) return { kind: "select-network" };

  const network = args.selected;
  const netFamily = networkFamily(network)!;
  const evm = familyOf(args.evmAddress);
  const sol = familyOf(args.solAddress);
  const connectedFamily = evm ?? sol;

  // A connected wallet whose family mismatches the selected network is
  // a mismatch — never a silent network switch.
  if (connectedFamily != null && connectedFamily !== netFamily) {
    return {
      kind: "mismatch",
      message:
        connectedFamily === "solana"
          ? "Connected wallet is not compatible with the selected network. Please connect an EVM wallet."
          : "Connected wallet is not compatible with the selected network. Please connect a Solana wallet.",
    };
  }
  if (connectedFamily == null) return { kind: "connect", family: netFamily };

  // Family-level access satisfied. EVM networks additionally verify the
  // wallet's CURRENT chain against the selected network's official
  // chain id (explicit user-approved switch — never automatic).
  if (netFamily === "evm") {
    const targetHex = GATE_CHAIN_HEX[network as Exclude<GateNetwork, "solana">];
    if ((args.evmChainIdHex ?? "").toLowerCase() !== targetHex.toLowerCase()) {
      return {
        kind: "wrong-network",
        family: "evm",
        targetHex,
        targetName: GATE_CHAIN_NAME[network as Exclude<GateNetwork, "solana">],
        currentHex: args.evmChainIdHex ?? null,
      };
    }
  }
  // Solana family: the address is read from the Solana provider's own
  // connect() response (base58 public key) — provider-verified.
  return { kind: "ready" };
}

export const GATE_WALLETS: Record<GateFamily, string[]> = {
  solana: ["Phantom", "Solflare"],
  evm: ["MetaMask", "Rabby", "Coinbase Wallet", "Trust Wallet", "Rainbow"],
};