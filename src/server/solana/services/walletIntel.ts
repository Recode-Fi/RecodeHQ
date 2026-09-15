import { SOLANA_CONFIG } from "../config";
import { getSolanaStore } from "../store";
import type { SolanaRpcProvider } from "../providers/solanaRpc";
import type { SolanaSyncEngine } from "../engine";
import { resolveWalletTokenMarkets, type WalletTokenMarket } from "./walletMarkets";
import {
  fetchWalletActivityPage,
  type WalletActivityPage,
  type WalletActivityRecord,
} from "./walletActivity";

/**
 * ============================================================
 * SOLANA — Wallet Intelligence (read-only, live mainnet)
 * ============================================================
 * Balances: native SOL + SPL accounts (standard Token program AND
 * Token-2022), zero-balance accounts ignored, uiAmount precision.
 * Every held mint is resolved against the verified market pipeline
 * (exact-mint only): symbol/name/logo/price/24h where a verified
 * market exists — otherwise status "no-market" and no price. USD =
 * amount × verified price; unpriced tokens are excluded from the
 * portfolio total (never estimated).
 *
 * Activity: real transaction normalization via
 * services/walletActivity (signatures → parsed transactions →
 * classified records) with pagination + caching.
 */

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC9PHnBn5qxqf6SMo";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface SolanaWalletHolding {
  kind: "native" | "spl";
  mint: string | null;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  decimals: number | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  /** "priced" — verified exact-mint market; "no-market" — none exists. */
  status: "priced" | "no-market" | "metadata-unavailable";
  source: string;
}

export interface SolanaWalletBalances {
  chain: "solana";
  network: "mainnet-beta";
  address: string;
  chainOnline: boolean;
  holdings: SolanaWalletHolding[];
  pricedCount: number;
  unpricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

export type { WalletActivityPage, WalletActivityRecord };

function solHolding(price: number | null, change: number | null): SolanaWalletHolding {
  return {
    kind: "native",
    mint: null,
    symbol: "SOL",
    name: "Solana",
    logoUrl: null,
    decimals: 9,
    amount: null,
    priceUsd: price,
    valueUsd: null,
    change24hPct: change,
    status: price != null ? "priced" : "no-market",
    source: price != null ? "verified SOL market (WSOL/SOL pair)" : "no verified market",
  };
}

function holdingFromMarket(
  acc: { mint: string; amount: number | null; decimals: number | null },
  market: WalletTokenMarket | undefined,
): SolanaWalletHolding {
  const priced = market != null && market.priceUsd != null;
  return {
    kind: "spl",
    mint: acc.mint,
    symbol: market?.symbol ?? null,
    name: market?.name ?? null,
    logoUrl: market?.logoUrl ?? null,
    decimals: acc.decimals,
    amount: acc.amount,
    priceUsd: market?.priceUsd ?? null,
    valueUsd: priced && acc.amount != null ? acc.amount * (market?.priceUsd as number) : null,
    change24hPct: market?.change24hPct ?? null,
    status:
      market == null || market.source == null
        ? "metadata-unavailable"
        : priced
          ? "priced"
          : "no-market",
    source:
      market?.source === "dexscreener"
        ? "verified exact-mint market (dexscreener)"
        : market?.source === "store"
          ? "verified exact-mint market (engine store)"
          : market?.source === "no-market-found"
            ? "no verified exact-mint market"
            : "provider unavailable",
  };
}

export async function fetchSolanaWalletBalances(
  rpc: SolanaRpcProvider,
  engine: SolanaSyncEngine,
  address: string,
  storeOverride?: import("../store").SolanaStore,
): Promise<SolanaWalletBalances> {
  const errors: string[] = [];

  const solBalance = await rpc.getSolBalance(address);
  const chainOnline = solBalance != null;
  if (solBalance == null) errors.push("SOL balance unavailable (RPC rate limit or offline)");

  // Standard SPL + Token-2022 accounts (dedup by account address).
  const accounts = new Map<string, { mint: string; amount: number | null; decimals: number | null }>();
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const parsed = await rpc.getTokenAccounts(address, programId);
    for (const acc of parsed) {
      if (!accounts.has(acc.address)) {
        accounts.set(acc.address, {
          mint: acc.mint,
          amount: acc.amount.uiAmount,
          decimals: acc.amount.decimals,
        });
      }
    }
  }
  if (accounts.size === 0 && !chainOnline) {
    errors.push("SPL token accounts unavailable (RPC unreachable)");
  }
  // Ignore zero/empty accounts — nothing is rendered for them.
  const held = [...accounts.values()].filter((a) => a.amount != null && a.amount > 0);

  const holdings: SolanaWalletHolding[] = [];

  // SOL: resolve the verified SOL price through the same exact-mint pipeline.
  const markets = await resolveWalletTokenMarkets(
    engine,
    [WSOL_MINT, ...held.map((h) => h.mint)],
    storeOverride,
  );
  const solMarket = markets.get(WSOL_MINT);
  const base = solHolding(solMarket?.priceUsd ?? null, solMarket?.change24hPct ?? null);
  if (solBalance != null) {
    base.amount = solBalance;
    base.valueUsd = base.priceUsd != null ? solBalance * base.priceUsd : null;
  }
  base.status = base.priceUsd != null ? "priced" : "no-market";
  holdings.push(base);

  for (const acc of held) {
    holdings.push(holdingFromMarket(acc, markets.get(acc.mint)));
  }

  const priced = holdings.filter((h) => h.status === "priced" && h.valueUsd != null);
  return {
    chain: SOLANA_CONFIG.chain,
    network: SOLANA_CONFIG.network,
    address,
    chainOnline,
    holdings,
    pricedCount: priced.length,
    unpricedCount: holdings.length - priced.length,
    totalValueUsd: priced.length > 0 ? priced.reduce((a, h) => a + (h.valueUsd as number), 0) : null,
    updatedAt: Date.now(),
    errors,
  };
}

/** Verified price provider for activity USD values (exact mint; null → SOL). */
function priceProvider(): (mint: string | null) => number | null {
  const store = getSolanaStore().get();
  const solPrice = store.tokens[WSOL_MINT]?.priceUsd ?? null;
  return (mint) => {
    if (mint == null) return solPrice;
    return store.tokens[mint]?.priceUsd ?? null;
  };
}

/**
 * One page of normalized wallet activity (signature → parsed transaction
 * records). Pagination via `before` cursor.
 */
export async function fetchSolanaWalletActivityPage(
  rpc: SolanaRpcProvider,
  address: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<WalletActivityPage> {
  return fetchWalletActivityPage(rpc, address, {
    limit: opts.limit ?? 25,
    detailLimit: 12,
    before: opts.before ?? null,
    priceOf: priceProvider(),
  });
}

/** Agent compatibility wrapper — latest page of normalized activity. */
export async function fetchSolanaWalletActivity(
  rpc: SolanaRpcProvider,
  engine: SolanaSyncEngine,
  address: string,
  limit = 25,
): Promise<WalletActivityPage> {
  void engine;
  return fetchWalletActivityPage(rpc, address, {
    limit,
    detailLimit: 8,
    priceOf: priceProvider(),
  });
}
