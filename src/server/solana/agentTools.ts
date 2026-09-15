import { getSolanaSyncEngine } from "./engine";
import { getSolanaStore } from "./store";
import { toRows, toWhaleFeed, holderConcentration, tokenDetail } from "./services/rows";
import { SOLANA_CONFIG } from "./config";
import { SOLANA_ADDRESS_RE } from "@/lib/types";
import type { ToolDef } from "@/server/agent/types";
import type { SolanaToken } from "./types";

/**
 * ============================================================
 * RECODE Agent — Solana tools
 * ============================================================
 * Every tool reads the Solana intelligence layer (its own store +
 * live providers). Chain identity is explicit in every result:
 * "solana" — mint addresses are base58 and are NEVER processed as
 * EVM contracts. Nulls mean unavailable and stay null.
 */

function round(n: number | null | undefined, dp = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

function err(message: string): { error: string; provenance: "UNAVAILABLE" } {
  return { error: message, provenance: "UNAVAILABLE" };
}

function engine() {
  getSolanaSyncEngine().ensureStarted();
}

function resolveToken(query: string): SolanaToken | null {
  const s = query.trim();
  const d = getSolanaStore().get();
  if (SOLANA_ADDRESS_RE.test(s)) return d.tokens[s] ?? null;
  const sym = s.toUpperCase();
  return (
    Object.values(d.tokens)
      .filter((t) => (t.symbol ?? "").toUpperCase() === sym && t.priceUsd != null)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))[0] ?? null
  );
}

const getSolanaMarkets: ToolDef = {
  name: "getSolanaMarkets",
  description:
    "Top tracked Solana tokens with verified live DEX market data: price, market cap, liquidity, " +
    "24h volume, 24h change, buy/sell activity, DEX and pair info. Chain identity: Solana " +
    "mainnet-beta (mint addresses are base58, not EVM contracts).",
  parameters: [
    { name: "limit", type: "number", description: "How many tokens (default 12, max 40)." },
    { name: "query", type: "string", description: "Optional filter by symbol/name substring." },
  ],
  async execute({ limit, query }) {
    engine();
    const d = getSolanaStore().get();
    let rows = toRows(d).filter((r) => r.price != null);
    const q = String(query ?? "").trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.symbol ?? "").toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    const n = Math.max(1, Math.min(40, Math.floor(Number(limit) || 12)));
    return {
      provenance: rows.length ? "LIVE" : "UNAVAILABLE",
      chain: "solana",
      network: "mainnet-beta",
      count: rows.length,
      tokens: rows.slice(0, n).map((r) => ({
        mint: r.mint,
        symbol: r.symbol,
        name: r.name,
        priceUsd: round(r.price, 8),
        change24hPct: round(r.change24hPct),
        marketCap: r.marketCap != null ? round(r.marketCap) : null,
        fdv: r.fdv != null ? round(r.fdv) : null,
        liquidityUsd: r.liquidity != null ? round(r.liquidity) : null,
        volume24hUsd: r.volume24h != null ? round(r.volume24h) : null,
        buys24h: r.buys24h,
        sells24h: r.sells24h,
        dexId: r.dexId,
        pairAddress: r.pairAddress,
        dataStatus: r.dataStatus,
      })),
      note: rows.length === 0 ? "No verified Solana quotes available yet." : null,
    };
  },
};

const getSolanaTokenIntel: ToolDef = {
  name: "getSolanaTokenIntel",
  description:
    "Deep intelligence for one Solana token (by base58 mint address or symbol): market state, " +
    "holder concentration (top-10 share of verified supply), recent whale movements and pair info. " +
    "NEVER pass an 0x EVM address here — those belong to the EVM scan/intelligence tools.",
  parameters: [
    { name: "token", type: "string", description: "Solana mint address (base58) or symbol.", required: true },
  ],
  async execute({ token }) {
    engine();
    const query = String(token ?? "");
    const d = getSolanaStore().get();
    const resolved = resolveToken(query);
    if (SOLANA_ADDRESS_RE.test(query.trim()) && !resolved) {
      return err(
        "This base58 address is not indexed by the Solana engine. It may exist on-chain but is outside the tracked universe.",
      );
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(query.trim())) {
      return err("0x… is an EVM address, not a Solana mint. Use the EVM tools for EVM contracts.");
    }
    if (!resolved) return err(`No tracked Solana token for "${query}".`);
    const detail = tokenDetail(d, resolved.mint);
    if (!detail) return err("Token detail unavailable.");
    const conc = holderConcentration(detail.holders, 10);
    return {
      provenance:
        detail.dataStatus === "unavailable"
          ? "UNAVAILABLE"
          : detail.dataStatus === "live"
            ? "LIVE"
            : "HISTORICAL",
      chain: "solana",
      network: "mainnet-beta",
      mint: resolved.mint,
      symbol: resolved.symbol,
      name: resolved.name,
      priceUsd: round(resolved.priceUsd, 8),
      priceBasis: resolved.sources.length > 0 ? resolved.sources.join(", ") : null,
      change24hPct: round(resolved.change24hPct),
      marketCap: resolved.marketCap != null ? round(resolved.marketCap) : null,
      liquidityUsd: resolved.liquidityUsd != null ? round(resolved.liquidityUsd) : null,
      volume24hUsd: resolved.volume24hUsd != null ? round(resolved.volume24hUsd) : null,
      buys24h: resolved.buys24h,
      sells24h: resolved.sells24h,
      dexId: resolved.dexId,
      pairAddress: resolved.pairAddress,
      supply: resolved.supply,
      top10ConcentrationPct: conc.value != null ? round(conc.value) : null,
      concentrationBasis:
        "Share of verified supply held by the 10 largest token accounts (Solana RPC)",
      recentWhaleEvents: detail.whales.slice(0, 10).map((w) => ({
        kind: w.kind,
        usd: w.usd != null ? round(w.usd) : null,
        amount: w.amount,
        wallet: w.wallet,
        observedAt: w.observedAt,
        source: w.source,
      })),
    };
  },
};

const getSolanaWalletIntel: ToolDef = {
  name: "getSolanaWalletIntel",
  description:
    "Live on-chain intelligence for a Solana wallet (base58): native SOL balance, SPL token " +
    "holdings with USD value where verified pricing exists, and recent signature activity. " +
    "NEVER pass an 0x EVM address — Solana addresses are base58 and handled by separate logic.",
  parameters: [
    { name: "address", type: "string", description: "Solana wallet address (base58).", required: true },
  ],
  async execute({ address }) {
    engine();
    const a = String(address ?? "").trim();
    if (!SOLANA_ADDRESS_RE.test(a)) {
      return err(
        "Not a valid base58 Solana address. 0x… addresses are EVM — use getWalletIntelligence for those.",
      );
    }
    const { fetchSolanaWalletBalances, fetchSolanaWalletActivity } =
      await import("./services/walletIntel");
    const [balances, activity] = await Promise.all([
      fetchSolanaWalletBalances(getSolanaSyncEngine().rpc, a),
      fetchSolanaWalletActivity(getSolanaSyncEngine().rpc, a).catch(() => null),
    ]);
    return {
      provenance: balances.chainOnline ? "LIVE" : "UNAVAILABLE",
      chain: "solana",
      network: "mainnet-beta",
      address: a,
      chainOnline: balances.chainOnline,
      totalValueUsd: balances.totalValueUsd != null ? round(balances.totalValueUsd) : null,
      valueBasis:
        balances.pricedCount > 0
          ? "sum of holdings × verified engine prices (unpriced tokens excluded)"
          : null,
      errors: balances.errors,
      holdings: balances.holdings.map((h) => ({
        kind: h.kind,
        mint: h.mint,
        symbol: h.symbol,
        amount: h.amount,
        priceUsd: h.priceUsd != null ? round(h.priceUsd, 8) : null,
        valueUsd: h.valueUsd != null ? round(h.valueUsd) : null,
        change24hPct: h.change24hPct != null ? round(h.change24hPct) : null,
      })),
      activity: activity
        ? {
            available: activity.available,
            recentCount: activity.signatures.length,
            firstSeen: activity.firstSeen,
            recentSignatures: activity.signatures.slice(0, 10).map((s) => ({
              signature: s.signature,
              ts: s.ts,
              failed: s.failed,
            })),
          }
        : null,
      note:
        balances.holdings.filter((h) => h.priceUsd == null).length > 0
          ? "Some holdings have no verified market price — their USD value is unavailable (not zero)."
          : null,
    };
  },
};

const getSolanaWhaleActivity: ToolDef = {
  name: "getSolanaWhaleActivity",
  description:
    "Recent large-balance movements on tracked Solana tokens (large transfers, accumulation, " +
    "distribution) observed between largest-account snapshots. USD only where a verified price " +
    "exists; unpaired moves are labeled by delta direction, never as buy/sell swaps.",
  parameters: [
    { name: "token", type: "string", description: "Optional Solana mint or symbol filter." },
    { name: "limit", type: "number", description: "Max events (default 20, max 50)." },
  ],
  async execute({ token, limit }) {
    engine();
    const d = getSolanaStore().get();
    let events = toWhaleFeed(d, 300);
    const query = String(token ?? "").trim();
    if (query) {
      const resolved = resolveToken(query);
      if (resolved) events = events.filter((e) => e.mint === resolved.mint);
      else if (SOLANA_ADDRESS_RE.test(query)) events = events.filter((e) => e.mint === query);
    }
    const n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
    return {
      provenance: events.length ? "LIVE" : "UNAVAILABLE",
      chain: "solana",
      network: "mainnet-beta",
      thresholdUsd: SOLANA_CONFIG.whaleThresholdUsd,
      basis:
        "Largest-account balance deltas between Solana RPC snapshots; paired in/out within 5% = transfer",
      count: events.length,
      events: events.slice(0, n).map((e) => ({
        mint: e.mint,
        symbol: e.symbol,
        kind: e.kind,
        amount: e.amount,
        usd: e.usd != null ? round(e.usd) : null,
        wallet: e.wallet,
        observedAt: e.observedAt,
        source: e.source,
      })),
      note: events.length === 0 ? "No whale events observed yet." : null,
    };
  },
};

const getSolanaRadar: ToolDef = {
  name: "getSolanaRadar",
  description:
    "Current RECODE Radar signals for Solana: unusual volume, liquidity changes, large " +
    "transfers, whale activity, significant price movement and newly active pairs — each with " +
    "the exact verified numbers it was derived from.",
  parameters: [],
  async execute() {
    engine();
    const d = getSolanaStore().get();
    const signals = [...d.radar].sort((a, b) => b.detectedAt - a.detectedAt);
    return {
      provenance: signals.length ? "LIVE" : "UNAVAILABLE",
      chain: "solana",
      network: "mainnet-beta",
      count: signals.length,
      signals: signals.slice(0, 25),
      note: signals.length === 0 ? "No Solana radar signals yet (insufficient tracked history)." : null,
    };
  },
};

export const SOLANA_AGENT_TOOLS: ToolDef[] = [
  getSolanaMarkets,
  getSolanaTokenIntel,
  getSolanaWalletIntel,
  getSolanaWhaleActivity,
  getSolanaRadar,
];