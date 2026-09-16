/**
 * ============================================================
 * Wallet gate — pure decision logic (unit-tested)
 * ============================================================
 * The terminal requires a connected wallet compatible with the
 * selected network. Family mismatches produce an explicit state —
 * the network is never silently switched. "all" (All Networks) is
 * not a valid gate network: a specific chain must be selected.
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
  | { kind: "ready" };

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
 */
export function gateStatus(args: {
  mounted: boolean;
  selected: string;
  evmAddress: string | null;
  solAddress: string | null;
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
  if (connectedFamily != null) return { kind: "ready" };
  return { kind: "connect", family: netFamily };
}

export const GATE_WALLETS: Record<GateFamily, string[]> = {
  solana: ["Phantom", "Solflare"],
  evm: ["MetaMask", "Rabby", "Coinbase Wallet", "Trust Wallet", "Rainbow"],
};