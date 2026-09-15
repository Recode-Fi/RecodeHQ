import { SOLANA_CONFIG } from "../config";
import { getSolanaStore } from "../store";
import type { SolanaStoreShape } from "../store";
import type { SolanaRpcProvider } from "../providers/solanaRpc";

/**
 * ============================================================
 * SOLANA — Wallet Intelligence (read-only, live RPC)
 * ============================================================
 * Solana addresses are NEVER routed through EVM balance logic.
 * Balances: native SOL (getBalance) + SPL token accounts
 * (getTokenAccountsByOwner, jsonParsed). USD values are set only
 * where the engine holds a verified price for the mint —
 * otherwise null ("Data unavailable"). Activity: real
 * getSignaturesForAddress entries with block timestamps and
 * status; no fabricated transfer direction.
 */

export interface SolanaWalletHolding {
  kind: "native" | "spl";
  mint: string | null;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  source: string;
}

export interface SolanaWalletBalances {
  chain: "solana";
  network: "mainnet-beta";
  address: string;
  chainOnline: boolean;
  holdings: SolanaWalletHolding[];
  pricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

export interface SolanaWalletActivity {
  chain: "solana";
  network: "mainnet-beta";
  address: string;
  chainOnline: boolean;
  signatures: {
    signature: string;
    ts: number | null;
    failed: boolean | null;
    explorerUrl: string;
  }[];
  available: boolean;
  firstSeen: number | null;
  txCount: number | null;
  updatedAt: number;
  errors: string[];
}

/** Native SOL holding with the engine's verified WSOL/SOL price. */
function solHolding(store: SolanaStoreShape): SolanaWalletHolding {
  const wsol = store.tokens["So11111111111111111111111111111111111111112"];
  const price = wsol?.priceUsd ?? null;
  return {
    kind: "native",
    mint: null,
    symbol: "SOL",
    name: "Solana",
    logoUrl: null,
    amount: null,
    priceUsd: price,
    valueUsd: null,
    change24hPct: wsol?.change24hPct ?? null,
    source: price != null ? "dexscreener (WSOL/SOL pair)" : "unavailable",
  };
}

export async function fetchSolanaWalletBalances(
  rpc: SolanaRpcProvider,
  address: string,
): Promise<SolanaWalletBalances> {
  const store = getSolanaStore().get();
  const errors: string[] = [];
  const holdings: SolanaWalletHolding[] = [];
  const base = solHolding(store);

  const solBalance = await rpc.getSolBalance(address);
  let chainOnline = solBalance != null;
  if (solBalance == null) errors.push("SOL balance unavailable (RPC rate limit or offline)");
  else {
    base.amount = solBalance;
    base.valueUsd = base.priceUsd != null ? solBalance * base.priceUsd : null;
  }
  holdings.push(base);

  const accounts = await rpc.getTokenAccounts(address);
  if (accounts.length === 0 && chainOnline) {
    // Distinguish "no SPL accounts" from RPC failure is not possible via
    // this method alone — empty is treated as honest empty only when the
    // balance call succeeded (chain reachable).
  }
  for (const acc of accounts) {
    if (acc.amount.uiAmount == null || acc.amount.uiAmount === 0) continue;
    const token = store.tokens[acc.mint];
    const price = token?.priceUsd ?? null;
    holdings.push({
      kind: "spl",
      mint: acc.mint,
      symbol: token?.symbol ?? null,
      name: token?.name ?? null,
      logoUrl: token?.logoUrl ?? null,
      amount: acc.amount.uiAmount,
      priceUsd: price,
      valueUsd:
        price != null && acc.amount.uiAmount != null ? acc.amount.uiAmount * price : null,
      change24hPct: token?.change24hPct ?? null,
      source: price != null ? "engine price (dexscreener)" : "unpriced",
    });
  }
  if (accounts.length === 0 && !chainOnline) {
    errors.push("SPL token accounts unavailable (RPC unreachable)");
  }

  const priced = holdings.filter((h) => h.valueUsd != null);
  return {
    chain: SOLANA_CONFIG.chain,
    network: SOLANA_CONFIG.network,
    address,
    chainOnline,
    holdings,
    pricedCount: priced.length,
    totalValueUsd:
      priced.length > 0
        ? priced.reduce((a, h) => a + (h.valueUsd as number), 0)
        : null,
    updatedAt: Date.now(),
    errors,
  };
}

export async function fetchSolanaWalletActivity(
  rpc: SolanaRpcProvider,
  address: string,
  limit = 25,
): Promise<SolanaWalletActivity> {
  const errors: string[] = [];
  const sigs = await rpc.getSignatures(address, limit);
  const available = sigs != null;
  if (!available) errors.push("Signature history unavailable (RPC rate limit or offline)");
  const entries = (sigs ?? []).map((s) => ({
    signature: s.signature,
    ts: s.blockTime != null ? s.blockTime * 1000 : null,
    failed: s.err != null,
    explorerUrl: `https://solscan.io/tx/${s.signature}`,
  }));
  const times = entries.map((e) => e.ts).filter((t): t is number => t != null);
  return {
    chain: SOLANA_CONFIG.chain,
    network: SOLANA_CONFIG.network,
    address,
    chainOnline: available,
    signatures: entries,
    available,
    firstSeen: times.length > 0 ? Math.min(...times) : null,
    txCount: available ? entries.length : null,
    updatedAt: Date.now(),
    errors,
  };
}
