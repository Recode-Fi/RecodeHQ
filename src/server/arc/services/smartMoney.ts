import { getArcStore } from "../store";

/**
 * ============================================================
 * ARC — Smart Money (verified net USDC flow ranking)
 * ============================================================
 * Wallets ranked by measured net USDC flow (inflows + mints −
 * outflows − burns) from the Arc system-emitter event stream.
 * Transfers are direction-neutral and excluded from the net.
 * No scores, win rates or PnL — those are not reliably measurable
 * here and are never fabricated.
 */

export interface ArcSmartMoneyWallet {
  chain: "arc";
  wallet: string;
  netUsdc: number | null;
  inflows: number;
  outflows: number;
  transfers: number;
  lastActive: number;
}

export function arcSmartMoney(windowHours = 24): ArcSmartMoneyWallet[] {
  const cutoff = Date.now() - windowHours * 3_600_000;
  const events = getArcStore()
    .get()
    .stablecoin.filter((e) => e.observedAt >= cutoff);

  const byWallet = new Map<string, ArcSmartMoneyWallet>();
  const touch = (wallet: string): ArcSmartMoneyWallet => {
    let w = byWallet.get(wallet);
    if (!w) {
      w = {
        chain: "arc",
        wallet,
        netUsdc: 0,
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
      w.netUsdc = (w.netUsdc ?? 0) + e.amountUsdc;
    } else if (e.kind === "outflow" || e.kind === "burn") {
      w.outflows += 1;
      w.netUsdc = (w.netUsdc ?? 0) - e.amountUsdc;
    } else {
      w.transfers += 1;
    }
    w.lastActive = Math.max(w.lastActive, e.observedAt);
  }

  return [...byWallet.values()]
    .filter((w) => w.inflows + w.outflows > 0)
    .sort((a, b) => (b.netUsdc ?? 0) - (a.netUsdc ?? 0))
    .slice(0, 50);
}