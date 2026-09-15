import { SYNC_CONFIG } from "../config";
import { OnchainProvider } from "../providers/onchain";
import { getExplorerProvider } from "../providers/explorerInstance";
import type { ExplorerAddressTransfer } from "../providers/explorer";
import { getSyncStore } from "../store";

export interface WalletBalance {
  address: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  contract: string | null; // null = native asset
  decimals: number | null;
  amount: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  source: string;
}

export interface WalletBalancesResult {
  address: string;
  chainId: number;
  chainOnline: boolean;
  nativeSymbol: string;
  balances: WalletBalance[];
  /** null when no priced balance exists — never zero-padded */
  totalValueUsd: number | null;
  updatedAt: number;
  errors: string[];
}

const g = globalThis as unknown as { __recodeOnchain?: OnchainProvider };

export function getOnchainProvider(): OnchainProvider {
  g.__recodeOnchain ??= new OnchainProvider(SYNC_CONFIG.rpcUrl);
  return g.__recodeOnchain;
}

/**
 * Live on-chain wallet balances: native coin via eth_getBalance plus every
 * verified indexed token via eth_call balanceOf. Prices come exclusively
 * from the sync store (explorer exchange rate / RHJ mid) — balances are
 * always real; USD values exist only when a verified price exists.
 */
export async function fetchWalletBalances(address: string): Promise<WalletBalancesResult> {
  const onchain = getOnchainProvider();
  const store = getSyncStore().get();
  const errors: string[] = [];
  const balances: WalletBalance[] = [];

  const chainIdHex = await onchain.chainId();
  const chainOnline = chainIdHex != null;
  if (!chainOnline) errors.push("RPC unreachable");

  if (chainOnline) {
    const wei = await onchain.nativeBalanceWei(address);
    if (wei != null) {
      balances.push({
        address,
        symbol: "ETH",
        name: "Ether (native)",
        logoUrl: null,
        contract: null,
        decimals: 18,
        amount: Number(wei) / 1e18,
        priceUsd: null,
        valueUsd: null,
        change24hPct: null,
        source: "RPC eth_getBalance",
      });
    } else {
      errors.push("Native balance unavailable");
    }
  }

  const markets = Object.values(store.markets);
  const BATCH = 12;
  for (let i = 0; i < markets.length; i += BATCH) {
    const slice = markets.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (m) => {
        if (m.decimals == null) return null;
        const raw = await onchain.balanceOfRaw(m.address, address);
        if (raw == null || raw === BigInt(0)) return null;
        const amount = Number(raw) / 10 ** m.decimals;
        const price = store.prices[m.address];
        const priceUsd = price?.price ?? null;
        return {
          address: m.address,
          symbol: m.symbol,
          name: m.name,
          logoUrl: store.logos[m.address]?.url ?? m.logoUrl ?? null,
          contract: m.address,
          decimals: m.decimals,
          amount,
          priceUsd,
          valueUsd: priceUsd != null ? amount * priceUsd : null,
          change24hPct: price?.change24hPct ?? null,
          source: "RPC eth_call balanceOf",
        } satisfies WalletBalance;
      }),
    );
    for (const r of results) if (r) balances.push(r);
  }

  const totalValueUsd = balances.some((b) => b.valueUsd != null)
    ? balances.reduce((acc, b) => acc + (b.valueUsd ?? 0), 0)
    : null;

  return {
    address,
    chainId: SYNC_CONFIG.chainId,
    chainOnline,
    nativeSymbol: "ETH",
    balances,
    totalValueUsd,
    updatedAt: Date.now(),
    errors,
  };
}

export interface WalletActivity {
  address: string;
  chainOnline: boolean;
  transfers: {
    txHash: string;
    ts: number | null;
    direction: "in" | "out" | "self" | "transfer";
    counterparty: string | null;
    tokenSymbol: string | null;
    tokenName: string | null;
    tokenAddress: string | null;
    amount: number | null;
    usd: number | null;
  }[];
  transfersAvailable: boolean;
  /** Which verified source served the activity: explorer, the engine's
      measured on-chain transfer store, or null when neither could. */
  source: "explorer" | "store" | null;
  txCount: number | null;
  accountAge: number | null;
  errors: string[];
  updatedAt: number;
}

/** Wallet on-chain activity: explorer first; when the explorer is
    unreachable (403), falls back to the engine's REAL measured transfer
    store (verified eth_getLogs / explorer rows for the recent window) and
    the RPC transaction nonce (real "transactions sent" count). Nothing is
    simulated. */
export async function fetchWalletActivity(address: string): Promise<WalletActivity> {
  const explorer = getExplorerProvider();
  const onchain = getOnchainProvider();
  const store = getSyncStore().get();
  const errors: string[] = [];
  const [info, transfers] = await Promise.all([
    explorer.addressInfo(address),
    explorer.addressTokenTransfers(address, 80),
  ]);
  const rows: WalletActivity["transfers"] = [];
  let source: WalletActivity["source"] = null;

  if (transfers) {
    source = "explorer";
    for (const t of transfers) {
      if (!t.from || !t.to) continue;
      const dir =
        t.from === address && t.to === address
          ? "self"
          : t.from === address
            ? "out"
            : t.to === address
              ? "in"
              : null;
      if (!dir) continue;
      rows.push({
        txHash: t.txHash,
        ts: t.ts,
        direction: dir,
        counterparty: dir === "in" ? t.from : t.to,
        tokenSymbol: t.tokenSymbol,
        tokenName: t.tokenName,
        tokenAddress: t.tokenAddress,
        amount: t.amount,
        usd: null,
      });
    }
  } else {
    errors.push("Explorer data unavailable");
    /* Store fallback: the engine's verified transfer feed (real on-chain
       events for the recent window). Direction derives from the verified
       DEX-side classification: buy = tokens received, sell = sent. */
    const walletRows = store.transactions.filter(
      (t) => t.wallet != null && t.wallet.toLowerCase() === address,
    );
    if (walletRows.length > 0) {
      source = "store";
      for (const t of walletRows) {
        rows.push({
          txHash: t.hash,
          ts: t.ts,
          direction:
            t.action === "sell"
              ? ("out" as const)
              : t.action === "buy"
                ? ("in" as const)
                : ("transfer" as const),
          counterparty: null,
          tokenSymbol: t.symbol,
          tokenName: null,
          tokenAddress: t.address,
          amount: t.amount,
          usd: t.usd,
        });
      }
    } else {
      errors.push("No recent on-chain activity for this address in the indexed window");
    }
  }

  /* Transaction count: explorer when reachable, else the RPC nonce — a real,
     verifiable "transactions sent" count for this address. */
  let txCount = info?.txCount ?? null;
  let accountAge = info?.firstFundedTimestamp ?? info?.creationTimestamp ?? null;
  if (txCount == null) {
    const nonce = await onchain.txCount(address);
    if (nonce != null) {
      txCount = nonce;
    } else {
      errors.push("Transaction count unavailable");
    }
  }

  return {
    address,
    chainOnline: explorer.state.ok === true,
    transfers: rows,
    transfersAvailable: transfers != null,
    source,
    txCount,
    accountAge,
    errors,
    updatedAt: Date.now(),
  };
}

