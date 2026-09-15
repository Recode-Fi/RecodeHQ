import type { WhaleAction } from "./types";

/**
 * ============================================================
 * RECODE — evidence-based transfer classification (pure)
 * ============================================================
 * A transfer is labeled BUY/SELL only when a DEX/swap component
 * is PROVABLY on one side of the transfer (verified contract
 * name from the explorer). Token-to-token or EOA-to-EOA moves
 * are TRANSFER. Burn/mint addresses are never trades.
 */

const DEX_NAME = /router|pool|swap|pair|vault|ramses|uniswap|sushi|curve|balancer|velodrome|aerodrome|camelot|pancake|quickswap|dodo/i;

export const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000001",
]);

export function isBurnAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return BURN_ADDRESSES.has(address.toLowerCase());
}

export interface ClassificationInput {
  from: string;
  to: string;
  fromName: string | null;
  toName: string | null;
  fromIsContract: boolean;
  toIsContract: boolean;
  /** Decoded parent-tx method, when the explorer provides one. */
  method?: string | null;
}

export interface ClassificationResult {
  action: WhaleAction;
  /** Proof when action is buy/sell; null for transfer. */
  basis: string | null;
}

/** True only for contract labels that name a DEX component. */
export function isDexName(name: string | null, isContract: boolean): boolean {
  return Boolean(name && isContract && DEX_NAME.test(name));
}

/**
 * Classify one transfer from explorer-proven facts only.
 * • token FROM a DEX component → the receiver BOUGHT
 * • token TO a DEX component → the sender SOLD
 * • decoded swap method on the parent tx corroborates the basis
 * • everything else — including ordinary wallet→wallet moves and
 *   settlement-contract flows — is TRANSFER
 */
export function classifyTransfer(input: ClassificationInput): ClassificationResult {
  const { from, to, fromName, toName, fromIsContract, toIsContract } = input;
  const dexFrom = isDexName(fromName, fromIsContract);
  const dexTo = isDexName(toName, toIsContract);
  const methodEvidence =
    input.method != null && /swap/i.test(input.method) ? String(input.method) : null;

  if (dexFrom && !dexTo && !isBurnAddress(to)) {
    return {
      action: "buy",
      basis: `DEX pool/router on the sending side (${fromName})` + (methodEvidence ? ` · tx method ${methodEvidence}` : ""),
    };
  }
  if (dexTo && !dexFrom && !isBurnAddress(from)) {
    return {
      action: "sell",
      basis: `DEX pool/router on the receiving side (${toName})` + (methodEvidence ? ` · tx method ${methodEvidence}` : ""),
    };
  }
  return { action: "transfer", basis: null };
}
