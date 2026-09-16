import { EVM_NET_CHAINS, type EvmNetChainKey } from "../config";
import { EvmNetRpcProvider } from "../providers/evmRpc";
import { EvmNetDexScreenerProvider, evmNetMarketFields } from "../providers/dexscreener";
import { getEvmNetStore } from "../store";
import type { EvmNetToken } from "../types";

/**
 * EVM NET — direct contract lookup (per chain, exact-match only):
 * on-chain metadata via eth_call + verified DexScreener market data.
 * Independent of the background indexed dataset.
 */

export interface EvmNetTokenIntel {
  chain: EvmNetChainKey;
  direct: boolean;
  token: EvmNetToken | null;
  metadata: {
    address: string;
    isContract: boolean;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
  pairs: number;
  source: string;
  errors: string[];
}

function isValidEvm(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function evmNetDirectLookup(
  chain: EvmNetChainKey,
  rpc: EvmNetRpcProvider,
  dexscreener: EvmNetDexScreenerProvider,
  rawAddress: string,
): Promise<EvmNetTokenIntel | null> {
  const address = rawAddress.toLowerCase();
  if (!isValidEvm(address)) return null;
  const cfg = EVM_NET_CHAINS[chain];
  const errors: string[] = [];

  const pairs = (await dexscreener.tokens([address])) ?? [];
  const best =
    pairs.length > 0
      ? [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
      : null;
  const store = getEvmNetStore(chain).get();
  const now = Date.now();

  let token = store.tokens[address] ?? null;
  if (best) {
    const fields = evmNetMarketFields(best);
    const base: EvmNetToken = token ?? {
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
    getEvmNetStore(chain).save();
    token = base;
  }

  const code = await rpc.getCode(address);
  const isContract = code != null && code !== "0x";
  let symbol: string | null = token?.symbol ?? null;
  let name: string | null = token?.name ?? null;
  let decimals: number | null = token?.decimals ?? null;
  if (isContract) {
    symbol = (await rpc.getSymbol(address)) ?? symbol;
    name = (await rpc.getName(address)) ?? name;
    decimals = (await rpc.getDecimals(address)) ?? decimals;
  } else if (code == null) {
    errors.push("Contract code unavailable (RPC error)");
  }

  return {
    chain,
    direct: true,
    token,
    metadata: { address, isContract, symbol, name, decimals },
    pairs: pairs.length,
    source: best
      ? `DexScreener (chain "${cfg.dexscreenerChain}") + ${cfg.name} RPC`
      : `${cfg.name} RPC eth_getCode/eth_call`,
    errors,
  };
}