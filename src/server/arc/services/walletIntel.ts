import { ARC_CONFIG, ARC_CHAIN } from "../config";
import { ArcRpcProvider } from "../providers/arcRpc";
import { ArcDexScreenerProvider, bestArcPair, arcMarketFields } from "../providers/dexscreener";
import { getArcStore, type ArcToken } from "../store";

/**
 * ============================================================
 * ARC — Wallet Intelligence (Arc mainnet, read-only)
 * ============================================================
 * - Native USDC balance via eth_getBalance (gas token, 18 decimals,
 *   displayed at face value ÷1e12 — never labeled ETH).
 * - ERC-20 holdings discovered from recent wallet-adjacent USDC logs.
 * - Portfolio value uses verified prices only. Unpriced holdings stay
 *   visible with null price/value — never 0, never estimated.
 */

export interface ArcHolding {
  kind: "native-gas" | "erc20";
  address: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  status: "priced" | "unpriced" | "unavailable";
}

export interface ArcWalletBalances {
  chain: "arc";
  network: "mainnet";
  chainId: number;
  address: string;
  chainOnline: boolean;
  holdings: ArcHolding[];
  pricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

function isValidEvm(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function fetchArcWalletBalances(
  rpc: ArcRpcProvider,
  dexscreener: ArcDexScreenerProvider,
  rawAddress: string,
): Promise<ArcWalletBalances> {
  const address = rawAddress.toLowerCase();
  const errors: string[] = [];
  const holdings: ArcHolding[] = [];

  const native = await rpc.getNativeUsdc(address);
  if (native == null) {
    errors.push("Native USDC balance unavailable (RPC error or rate limit)");
  } else if (native > 0) {
    holdings.push({
      kind: "native-gas",
      address: null,
      symbol: "USDC",
      name: "USDC (native gas)",
      decimals: ARC_CHAIN.gasDecimals,
      amount: native,
      priceUsd: 1,
      valueUsd: native,
      status: "priced",
    });
  }

  // USDC ERC-20 interface balance (shares the native balance per docs).
  const erc20 = await rpc.getErc20Balance(ARC_CHAIN.usdcErc20, address);
  if (erc20 != null && erc20 > 0) {
    holdings.push({
      kind: "erc20",
      address: ARC_CHAIN.usdcErc20,
      symbol: "USDC",
      name: "USD Coin (ERC-20 interface)",
      decimals: ARC_CHAIN.usdcErc20Decimals,
      amount: erc20,
      priceUsd: 1,
      valueUsd: erc20,
      status: "priced",
    });
  }

  // Tracked Arc tokens — read live balances for each (bounded batch).
  const store = getArcStore().get();
  const tracked = Object.values(store.tokens).filter(
    (t) => t.address !== ARC_CHAIN.usdcErc20,
  );
  for (const t of tracked.slice(0, 20)) {
    const bal = await rpc.getErc20Balance(t.address, address);
    if (bal == null || bal <= 0) continue;
    const price = t.priceUsd;
    holdings.push({
      kind: "erc20",
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      amount: bal,
      priceUsd: price,
      valueUsd: price != null ? bal * price : null,
      status: price != null ? "priced" : "unpriced",
    });
  }

  const priced = holdings.filter((h) => h.status === "priced");
  const total = priced.length > 0 ? priced.reduce((s, h) => s + (h.valueUsd ?? 0), 0) : null;

  return {
    chain: "arc",
    network: "mainnet",
    chainId: ARC_CONFIG.chainId,
    address,
    chainOnline: rpc.state.ok === true,
    holdings,
    pricedCount: priced.length,
    totalValueUsd: total,
    updatedAt: Date.now(),
    errors,
  };
}

export interface ArcTokenIntel {
  chain: "arc";
  direct: boolean;
  token: ArcToken | null;
  metadata: {
    address: string;
    isContract: boolean;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
  whales: number;
  pairs: number;
  source: string;
  errors: string[];
}

/** Direct contract lookup: on-chain metadata + verified market data. */
export async function arcDirectLookup(
  rpc: ArcRpcProvider,
  dexscreener: ArcDexScreenerProvider,
  rawAddress: string,
): Promise<ArcTokenIntel | null> {
  const address = rawAddress.toLowerCase();
  if (!isValidEvm(address)) return null;
  const errors: string[] = [];

  const pairs = (await dexscreener.tokens([address])) ?? [];
  // EXACT-MATCH rule: only pairs where the queried address is the BASE
  // token. DexScreener also returns pairs where the address is the
  // quote (e.g. everything trading against USDC) — using those would
  // attach another token's market to this address.
  const ownPairs = pairs.filter(
    (p) => p.baseToken?.address?.toLowerCase() === address,
  );
  const best = bestArcPair(ownPairs);
  const store = getArcStore().get();
  const now = Date.now();

  let token: ArcToken | null = store.tokens[address] ?? null;
  if (best) {
    const fields = arcMarketFields(best);
    const base: ArcToken = token ?? {
      address,
      symbol: null,
      name: null,
      logoUrl: null,
      decimals: null,
      priceUsd: null,
      marketCap: null,
      fdv: null,
      liquidity: null,
      volume24h: null,
      change24hPct: null,
      buys24h: null,
      sells24h: null,
      txns24h: null,
      dexId: null,
      pairAddress: null,
      quoteToken: null,
      pairCreatedAt: null,
      updatedAt: null,
      sources: [],
    };
    base.symbol = best.baseToken.symbol ?? base.symbol;
    base.name = best.baseToken.name ?? base.name;
    Object.assign(base, fields, { updatedAt: now });
    if (!base.sources.includes("dexscreener")) base.sources.push("dexscreener");
    store.tokens[address] = base;
    getArcStore().save();
    token = base;
  } else {
    // No exact-match pair: never serve a (possibly legacy-contaminated)
    // store entry as this address's market. Identity comes from the
    // on-chain RPC below — self-healing by construction.
    token = null;
  }

  const code = await rpc.getCode(address);
  const isContract = code != null && code !== "0x";
  // On-chain identity is authoritative for direct lookups (RPC wins
  // over any cached metadata).
  let symbol: string | null = null;
  let name: string | null = null;
  let decimals: number | null = null;
  if (isContract) {
    symbol = (await rpc.getSymbol(address)) ?? token?.symbol ?? null;
    name = (await rpc.getName(address)) ?? token?.name ?? null;
    decimals = (await rpc.getDecimals(address)) ?? token?.decimals ?? null;
  } else if (code == null) {
    errors.push("Contract code unavailable (RPC error)");
    symbol = token?.symbol ?? null;
    name = token?.name ?? null;
    decimals = token?.decimals ?? null;
  }

  return {
    chain: "arc",
    direct: true,
    token,
    metadata: { address, isContract, symbol, name, decimals },
    whales: getArcStore()
      .get()
      .whales.filter((w) => w.to === address || w.from === address).length,
    pairs: ownPairs.length,
    source: best
      ? 'DexScreener (chain "arc") + Arc RPC eth_getCode/eth_call'
      : "Arc RPC eth_getCode/eth_call",
    errors,
  };
}