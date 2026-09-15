/**
 * ============================================================
 * RECODE — Scan intelligence helpers (pure, deterministic)
 * ============================================================
 * Data classification contract (surfaced in the UI, never mixed):
 *   LIVE ON-CHAIN — direct Robinhood Chain RPC / indexer reads
 *   LIVE MARKET   — real market/quote provider (RHJ / engine store)
 *   CALCULATED    — RECODE-derived from verified inputs
 *   UNKNOWN       — cannot currently be proven
 */

import { midPrice, spreadPct } from "@/lib/market-math";
import { tradingStatusOf } from "@/lib/tradingSession";
import { fdvOf, marketCapFromCirculating } from "./supply";
import { provenance, type IntelSourceKind, type Provenance } from "./provenance";

/* ------------------------------------------------------------------ */
/* Contract capability detection (bytecode-selector evidence)          */
/* ------------------------------------------------------------------ */

export type CapabilityProof = "DETECTED" | "NOT DETECTED" | "UNKNOWN";

export interface ContractCapabilities {
  mintable: CapabilityProof;
  pausable: CapabilityProof;
  blacklist: CapabilityProof;
  upgradeable: CapabilityProof;
  /** Basis statement for the UI. */
  basis: string;
}

/** Verified function selectors (keccak4 of canonical signatures). */
const CAPABILITY_SELECTORS: Record<"mint" | "pause" | "blacklist" | "upgrade", string[]> = {
  mint: ["0x40c10f19"], // mint(address,uint256)
  pause: ["0x8456cb59", "0x013df7b3"], // pause() / pauseAll()
  blacklist: ["0x3f4ba83a", "0xe4990dc0"], // blacklist(address) / addToBlacklist variants
  upgrade: ["0x3659cfe6", "0x4f1ef286"], // upgradeTo(address) / upgradeToAndCall
};

/**
 * Evidence-based capability detection from runtime bytecode:
 *   bytecode available → selector present = "DETECTED", absent = "NOT DETECTED"
 *   bytecode unavailable → "UNKNOWN" (never "impossible" without proof)
 * Bytecode presence is evidence the function exists, not proof of
 * exploitability — the UI labels this as measured evidence, not a verdict.
 */
export function detectCapabilities(bytecodeHex: string | null): ContractCapabilities {
  const detect = (selectors: string[]): CapabilityProof => {
    if (bytecodeHex == null) return "UNKNOWN";
    const code = bytecodeHex.toLowerCase();
    return selectors.some((s) => code.includes(s.slice(2).toLowerCase())) ? "DETECTED" : "NOT DETECTED";
  };
  return {
    mintable: detect(CAPABILITY_SELECTORS.mint),
    pausable: detect(CAPABILITY_SELECTORS.pause),
    blacklist: detect(CAPABILITY_SELECTORS.blacklist),
    upgradeable: detect(CAPABILITY_SELECTORS.upgrade),
    basis:
      bytecodeHex != null
        ? "Function selectors measured in runtime bytecode — evidence of presence, not a security verdict"
        : "Bytecode unavailable — capabilities cannot be proven",
  };
}

/* ------------------------------------------------------------------ */
/* Contract age                                                        */
/* ------------------------------------------------------------------ */

export function contractAge(
  deployedAt: number | null,
  now: number,
): { days: number; label: string } | null {
  if (deployedAt == null || !Number.isFinite(deployedAt) || deployedAt > now) return null;
  const days = Math.floor((now - deployedAt) / 86_400_000);
  return { days, label: days === 0 ? "today" : days === 1 ? "1 day" : `${days} days` };
}

/* ------------------------------------------------------------------ */
/* Transfer activity aggregation (from verified store transfers)       */
/* ------------------------------------------------------------------ */

export interface ActivityTx {
  ts: number;
  /** buy | sell | transfer (DEX-classified where the source supports it) */
  action: string | null;
  amount: number | null;
  usd: number | null;
  hash: string | null;
  wallet: string | null;
  counterparty: string | null;
}

export interface ActivityAggregate {
  /** Measured transfers inside the window (null = none recorded). */
  transfers24h: number | null;
  uniqueWallets24h: number | null;
  /** Buy/sell split — ONLY when the source provides DEX classification. */
  buyTransfers: number | null;
  sellTransfers: number | null;
  classified: boolean;
  /** Net USD flow (buys − sells) — null without classification or USD. */
  netFlowUsd: number | null;
  latest: (ActivityTx & { usdLabel: string | null }) | null;
  largest: (ActivityTx & { usdLabel: string | null }) | null;
  /** 10 most recent verified transfers (newest first) — compact table. */
  recent: (ActivityTx & { usdLabel: string | null })[];
  basis: string;
}

function usdLabel(t: ActivityTx | null): string | null {
  return t?.usd != null && t.usd > 0
    ? `$${t.usd.toLocaleString("en", { maximumFractionDigits: 2 })}`
    : null;
}

/**
 * Aggregates verified transfers over a time window. Buy/sell counts are
 * produced only when the transfer source actually classified every row;
 * raw `transfer` rows are never reinterpreted as trades. Empty window →
 * nulls (never zeros), except buy/sell which stay null without classification.
 */
export function aggregateActivity(
  txs: ActivityTx[],
  now: number,
  windowMs: number = 86_400_000,
): ActivityAggregate {
  const cutoff = now - windowMs;
  const recent = txs.filter((t) => t.ts >= cutoff);
  const classified = recent.length > 0 && recent.every((t) => t.action === "buy" || t.action === "sell");
  const buys = recent.filter((t) => t.action === "buy");
  const sells = recent.filter((t) => t.action === "sell");
  const withUsd = recent.filter((t) => t.usd != null && t.usd > 0);
  const latestT = [...recent].sort((a, b) => b.ts - a.ts)[0] ?? null;
  const largestT = [...withUsd].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))[0] ?? null;

  return {
    transfers24h: recent.length > 0 ? recent.length : null,
    uniqueWallets24h:
      recent.length > 0
        ? new Set(recent.map((t) => t.wallet ?? t.counterparty ?? t.hash ?? "")).size
        : null,
    buyTransfers: classified ? buys.length : null,
    sellTransfers: classified ? sells.length : null,
    classified,
    netFlowUsd:
      classified && withUsd.length > 0
        ? Math.round(
            (buys.reduce((a, t) => a + (t.usd ?? 0), 0) - sells.reduce((a, t) => a + (t.usd ?? 0), 0)) * 100,
          ) / 100
        : null,
    latest: latestT ? { ...latestT, usdLabel: usdLabel(latestT) } : null,
    largest: largestT ? { ...largestT, usdLabel: usdLabel(largestT) } : null,
    recent: [...recent]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map((t) => ({ ...t, usdLabel: usdLabel(t) })),
    basis: classified
      ? "Verified on-chain transfers with DEX-classified direction"
      : "Raw verified token transfers — direction not classified by the source",
  };
}

/* ------------------------------------------------------------------ */
/* Scan market resolution (verified sources only)                      */
/* ------------------------------------------------------------------ */

export interface ScanMarketInput {
  /** Verified registry entry for this contract (when indexed). */
  known: {
    symbol: string | null;
    verified: boolean | null;
    tradingCapabilities: string[] | null;
    multiplier: number | null;
  } | null;
  /** Engine price row for this contract address (RHJ/engine verified). */
  price: {
    price: number | null;
    bid: number | null;
    ask: number | null;
    high: number | null;
    low: number | null;
    change24hPct: number | null;
    volume24h: number | null;
    halted: boolean | null;
    updatedAt: number | null;
    source: string | null;
  } | null;
  now: number;
  freshnessMs: number;
}

export interface ScanMarket {
  price: number | null;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  high24h: number | null;
  low24h: number | null;
  change24hPct: number | null;
  volume24h: number | null;
  tradingStatus: string | null;
  halted: boolean | null;
  updatedAt: number | null;
  freshness: "live" | "stale" | "unavailable";
  source: string | null;
}

/**
 * Resolves the verified market for a scanned contract. Null when the
 * contract is not an indexed priced market — callers render
 * "Market data unavailable", never $0.
 */
export function resolveScanMarket(input: ScanMarketInput): ScanMarket | null {
  const p = input.price;
  if (!p || p.price == null || p.price <= 0) return null;
  // Store bid/ask are already token-denominated (multiplier applied at write).
  return {
    price: p.price,
    bid: p.bid,
    ask: p.ask,
    spreadPct: spreadPct(p.bid, p.ask),
    high24h: p.high,
    low24h: p.low,
    change24hPct: p.change24hPct,
    volume24h: p.volume24h,
    tradingStatus: tradingStatusOf({
      halted: p.halted,
      capabilities: input.known?.tradingCapabilities ?? null,
      now: input.now,
    }),
    halted: p.halted,
    updatedAt: p.updatedAt,
    freshness:
      p.updatedAt == null
        ? "unavailable"
        : input.now - p.updatedAt <= input.freshnessMs
          ? "live"
          : "stale",
    source: p.source,
  };
}

/* ------------------------------------------------------------------ */
/* Scan market-cap / FDV provenance                                    */
/* ------------------------------------------------------------------ */

export interface ScanValuation {
  marketCap: number | null;
  marketCapSource: string | null;
  marketCapVerified: boolean | null;
  fdv: number | null;
  fdvBasis: string | null;
}

/** Strict provenance: mcap needs VERIFIED circulating; FDV needs on-chain total. */
export function scanValuation(args: {
  price: number | null;
  verifiedCirculating: number | null;
  registryMarketCap: number | null;
  onChainTotalSupply: number | null;
}): ScanValuation {
  const marketCap =
    args.registryMarketCap != null && args.registryMarketCap > 0
      ? args.registryMarketCap
      : marketCapFromCirculating(args.price, args.verifiedCirculating);
  const fdv = fdvOf(args.price, args.onChainTotalSupply);
  return {
    marketCap,
    marketCapSource:
      marketCap == null
        ? null
        : args.registryMarketCap != null && args.registryMarketCap > 0
          ? "verified circulating market cap (official registry)"
          : "price × verified circulating supply",
    marketCapVerified: marketCap == null ? null : true,
    fdv,
    fdvBasis:
      fdv == null
        ? null
        : `On-chain totalSupply() × live price (${args.onChainTotalSupply?.toLocaleString("en", { maximumFractionDigits: 4 })} tokens)`,
  };
}

/** Convenience: build provenance for a scan section. */
export function scanProvenance(
  source: string,
  kind: IntelSourceKind,
  updatedAt: number | null,
  now: number,
  freshnessMs: number,
): Provenance {
  return provenance(source, "scan-aggregator", kind, updatedAt, now, freshnessMs);
}