import { EVM_NET_CHAINS, evmNetConfig, isEvmNetChain, type EvmNetChainKey } from "./config";
import { EvmNetEngine } from "./engine";
import { EvmNetRpcProvider } from "./providers/evmRpc";

/**
 * EVM NET — per-chain engine registry. One engine per network, fully
 * isolated (own RPC, own store file, own DexScreener chain filter).
 */

const g = globalThis as unknown as {
  __recodeEvmNetEngines?: Map<EvmNetChainKey, EvmNetEngine>;
  __recodeEvmNetOnDemandRpc?: Map<EvmNetChainKey, EvmNetRpcProvider>;
};

export function getEvmNetEngine(chain: EvmNetChainKey): EvmNetEngine {
  g.__recodeEvmNetEngines ??= new Map();
  if (!g.__recodeEvmNetEngines.has(chain)) {
    g.__recodeEvmNetEngines.set(chain, new EvmNetEngine(EVM_NET_CHAINS[chain]));
  }
  return g.__recodeEvmNetEngines.get(chain)!;
}

export function getEvmNetOnDemandRpc(chain: EvmNetChainKey): EvmNetRpcProvider {
  g.__recodeEvmNetOnDemandRpc ??= new Map();
  if (!g.__recodeEvmNetOnDemandRpc.has(chain)) {
    const conf = evmNetConfig(chain);
    g.__recodeEvmNetOnDemandRpc.set(
      chain,
      new EvmNetRpcProvider(EVM_NET_CHAINS[chain], conf.requestTimeoutMs, conf.userAgent),
    );
  }
  return g.__recodeEvmNetOnDemandRpc.get(chain)!;
}

/** Parse + validate a chain route param ("ethereum" | "bsc" | "arbitrum"). */
export function parseEvmNetChain(raw: string | undefined): EvmNetChainKey | null {
  const key = (raw ?? "").toLowerCase();
  return isEvmNetChain(key) ? key : null;
}

export function startAllEvmNetEngines(): void {
  for (const key of Object.keys(EVM_NET_CHAINS) as EvmNetChainKey[]) {
    getEvmNetEngine(key).start();
  }
}