import { evmNetConfig, EVM_NET_CHAINS, type EvmNetChainKey } from "../config";
import { getEvmNetStore } from "../store";

/**
 * EVM NET — Smart Money: wallets ranked by verified net stablecoin
 * flow per chain (inflows + mints − outflows − burns) from the
 * chain's canonical-stablecoin event stream. Transfers are
 * direction-neutral. No scores/PnL/win-rates are fabricated; each
 * chain's ranking is computed from that chain's events only.
 */

export interface EvmNetSmartMoneyWallet {
  chain: EvmNetChainKey;
  wallet: string;
  netUsd: number | null;
  symbol: string;
  inflows: number;
  outflows: number;
  transfers: number;
  lastActive: number;
}

export function evmNetSmartMoney(
  chain: EvmNetChainKey,
  windowHours = 24,
): EvmNetSmartMoneyWallet[] {
  const conf = evmNetConfig(chain);
  const cutoff = Date.now() - windowHours * 3_600_000;
  const events = getEvmNetStore(chain)
    .get()
    .stablecoin.filter((e) => e.observedAt >= cutoff);

  const byWallet = new Map<string, EvmNetSmartMoneyWallet>();
  const touch = (wallet: string): EvmNetSmartMoneyWallet => {
    let w = byWallet.get(wallet);
    if (!w) {
      w = {
        chain,
        wallet,
        netUsd: 0,
        symbol: EVM_NET_CHAINS[chain].whaleSymbol,
        inflows: 0,
        outflows: 0,
        transfers: 0,
        lastActive: 0,
      };
      byWallet.set(wallet, w);
    }
    return w;
  };

  for (const e of events) {
    const w = touch(e.wallet);
    if (e.kind === "inflow" || e.kind === "mint") {
      w.inflows += 1;
      w.netUsd = (w.netUsd ?? 0) + e.usd;
    } else if (e.kind === "outflow" || e.kind === "burn") {
      w.outflows += 1;
      w.netUsd = (w.netUsd ?? 0) - e.usd;
    } else {
      w.transfers += 1;
    }
    w.lastActive = Math.max(w.lastActive, e.observedAt);
  }

  return [...byWallet.values()]
    .filter((w) => w.inflows + w.outflows > 0)
    .sort((a, b) => (b.netUsd ?? 0) - (a.netUsd ?? 0))
    .slice(0, 50);
}