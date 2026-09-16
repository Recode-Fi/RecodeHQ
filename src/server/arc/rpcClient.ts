import { ArcRpcProvider } from "./providers/arcRpc";
import { ARC_CONFIG } from "./config";

/**
 * Dedicated RPC instance for ON-DEMAND (user-facing) Arc requests —
 * wallet balances/activity, direct token lookup, AI tools. Background
 * engine cycles use the engine's own `rpc` instance; 429-backoff state
 * is independent so a background burst can never starve an interactive
 * route. Both read the same RECODE_ARC_RPC_URL.
 */

const g = globalThis as unknown as { __recodeOnDemandArcRpc?: ArcRpcProvider };

export function getArcOnDemandRpc(): ArcRpcProvider {
  g.__recodeOnDemandArcRpc ??= new ArcRpcProvider(ARC_CONFIG.rpcUrl);
  return g.__recodeOnDemandArcRpc;
}