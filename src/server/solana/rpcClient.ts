import { SolanaRpcProvider } from "./providers/solanaRpc";
import { SOLANA_CONFIG } from "./config";

/**
 * Dedicated RPC instance for ON-DEMAND (user-facing) requests — wallet
 * balances, wallet activity, direct token lookup, AI tools.
 *
 * Background engine tasks (whale/holder deltas) use the engine's own
 * `rpc` instance. Both read the same RECODE_SOLANA_RPC_URL, but their
 * 429-backoff state is independent — so a background burst hitting a
 * rate limit can never starve an interactive route (and vice versa).
 */

const g = globalThis as unknown as { __recodeOnDemandSolanaRpc?: SolanaRpcProvider };

export function getOnDemandRpc(): SolanaRpcProvider {
  g.__recodeOnDemandSolanaRpc ??= new SolanaRpcProvider(SOLANA_CONFIG.rpcUrl);
  return g.__recodeOnDemandSolanaRpc;
}