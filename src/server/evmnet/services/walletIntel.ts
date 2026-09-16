import { EVM_NET_CHAINS, type EvmNetChainKey } from "../config";
import { EvmNetRpcProvider } from "../providers/evmRpc";
import { EvmNetDexScreenerProvider } from "../providers/dexscreener";
import { getEvmNetStore } from "../store";

/**
 * EVM NET — Wallet Intelligence (per chain).
 * Data isolation is by chain: every read is scoped to the selected
 * chain's store and RPC. Unpriced holdings stay visible with null
 * price/value — never 0, never estimated.
 */

export interface EvmNetHolding {
  kind: "native" | "erc20";
  address: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  status: "priced" | "unpriced";
}

export interface EvmNetWalletBalances {
  chain: EvmNetChainKey;
  network: string;
  chainId: number;
  address: string;
  chainOnline: boolean;
  nativeSymbol: string;
  holdings: EvmNetHolding[];
  pricedCount: number;
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

function isValidEvm(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function fetchEvmNetWalletBalances(
  chain: EvmNetChainKey,
  rpc: EvmNetRpcProvider,
  dexscreener: EvmNetDexScreenerProvider,
  rawAddress: string,
): Promise<EvmNetWalletBalances> {
  void dexscreener;
  const cfg = EVM_NET_CHAINS[chain];
  const address = rawAddress.toLowerCase();
  const errors: string[] = [];
  const holdings: EvmNetHolding[] = [];

  const native = await rpc.getNativeBalance(address);
  if (native == null) {
    errors.push(`Native ${cfg.nativeSymbol} balance unavailable (RPC error or rate limit)`);
  } else if (native > 0) {
    holdings.push({
      kind: "native",
      address: null,
      symbol: cfg.nativeSymbol,
      name: `${cfg.nativeSymbol} (native)`,
      decimals: 18,
      amount: native,
      priceUsd: null,
      valueUsd: null,
      status: "unpriced",
    });
  }

  // Canonical stablecoin balance (verified emitter, face-value USD).
  const stable = await rpc.getErc20Balance(cfg.whaleEmitter, address);
  if (stable != null && stable > 0) {
    holdings.push({
      kind: "erc20",
      address: cfg.whaleEmitter,
      symbol: cfg.whaleSymbol,
      name: `${cfg.whaleSymbol} (canonical stablecoin)`,
      decimals: cfg.whaleDecimals,
      amount: stable,
      priceUsd: 1,
      valueUsd: stable,
      status: "priced",
    });
  }

  // Tracked chain tokens (bounded batch).
  const store = getEvmNetStore(chain).get();
  const tracked = Object.values(store.tokens).filter(
    (t) => t.address !== cfg.whaleEmitter,
  );
  for (const t of tracked.slice(0, 15)) {
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
    chain,
    network: "mainnet",
    chainId: cfg.chainId,
    address,
    chainOnline: rpc.state.ok === true || (rpc.state.lastSuccess != null && Date.now() - rpc.state.lastSuccess < 300_000),
    nativeSymbol: cfg.nativeSymbol,
    holdings,
    pricedCount: priced.length,
    totalValueUsd: total,
    updatedAt: Date.now(),
    errors,
  };
}

export { isValidEvm };