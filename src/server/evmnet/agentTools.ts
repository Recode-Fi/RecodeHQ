import type { ToolDef } from "../agent/types";
import { getEvmNetEngine, getEvmNetOnDemandRpc, parseEvmNetChain } from "./registry";
import { evmNetSmartMoney } from "./services/smartMoney";
import { getEvmNetStore } from "./store";

/**
 * ============================================================
 * EVM NET — Agent tools (Ethereum / BSC / Arbitrum)
 * ============================================================
 * Every tool takes an explicit `chain` parameter (ethereum | bsc |
 * arbitrum) — addresses are EVM 0x… and are never routed to Solana
 * or Arc tools, and never processed on a chain the user did not
 * select. Null fields are unavailable — never zeros.
 */

const CHAIN_PARAM = {
  name: "chain",
  type: "string" as const,
  description: "Target EVM network: ethereum | bsc | arbitrum.",
  required: true,
  enum: ["ethereum", "bsc", "arbitrum"],
};

export const EVM_NET_AGENT_TOOLS: ToolDef[] = [
  {
    name: "getEvmNetMarkets",
    description:
      "Live DEX markets for Ethereum, BSC or Arbitrum: tracked tokens with price, market cap, " +
      "FDV, liquidity, 24h volume, 24h change, buy/sell txns, DEX and pair address. Optional " +
      "query filters by symbol/name/contract. Null fields are unavailable — never zeros.",
    parameters: [CHAIN_PARAM, { name: "query", type: "string", description: "Optional symbol/name/contract filter.", required: false }],
    async execute({ chain, query }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      const store = getEvmNetStore(key).get();
      let rows = Object.values(store.tokens);
      const q = String(query ?? "").trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (t) =>
            (t.symbol ?? "").toLowerCase().includes(q) ||
            (t.name ?? "").toLowerCase().includes(q) ||
            t.address.toLowerCase().includes(q),
        );
      }
      rows = rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 25);
      return {
        chain: key,
        chainId: engine.cfg.chainId,
        count: rows.length,
        tokens: rows.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          priceUsd: t.priceUsd,
          marketCap: t.marketCap,
          fdv: t.fdv,
          liquidity: t.liquidity,
          volume24h: t.volume24h,
          change24hPct: t.change24hPct,
          buys24h: t.buys24h,
          sells24h: t.sells24h,
          dexId: t.dexId,
          pairAddress: t.pairAddress,
          dataStatus: t.updatedAt != null && Date.now() - t.updatedAt < 900_000 ? "live" : "stale",
        })),
      };
    },
  },
  {
    name: "getEvmNetTokenIntel",
    description:
      "Analyze one token on Ethereum, BSC or Arbitrum by 0x… contract: on-chain metadata " +
      "(symbol/name/decimals via chain RPC) plus verified market data (price, liquidity, " +
      "volume, change) and pair count.",
    parameters: [CHAIN_PARAM, { name: "address", type: "string", description: "Token contract address (0x…).", required: true }],
    async execute({ chain, address }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      const { evmNetDirectLookup } = await import("./services/directLookup");
      const result = await evmNetDirectLookup(
        key,
        getEvmNetOnDemandRpc(key),
        engine.dexscreener,
        String(address ?? "").trim(),
      );
      if (!result) return { error: "Invalid contract address (0x…, 40 hex).", provenance: "UNAVAILABLE" as const };
      return { ...result, chainId: engine.cfg.chainId };
    },
  },
  {
    name: "getEvmNetWalletIntel",
    description:
      "Analyze one wallet on Ethereum, BSC or Arbitrum (0x…): native balance, canonical " +
      "stablecoin balance (USDT/USDC — priced at face value), tracked-token holdings with " +
      "verified prices, portfolio value (priced only) and recent stablecoin movements.",
    parameters: [CHAIN_PARAM, { name: "address", type: "string", description: "Wallet address (0x…).", required: true }],
    async execute({ chain, address }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const a = String(address ?? "").trim().toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
        return { error: "Invalid wallet address.", provenance: "UNAVAILABLE" as const };
      }
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      const { fetchEvmNetWalletBalances } = await import("./services/walletIntel");
      const { fetchEvmNetWalletActivity } = await import("./services/walletActivity");
      const latest = await getEvmNetOnDemandRpc(key).latestBlock();
      const [balances, activity] = await Promise.all([
        fetchEvmNetWalletBalances(key, getEvmNetOnDemandRpc(key), engine.dexscreener, a),
        latest != null
          ? fetchEvmNetWalletActivity(key, getEvmNetOnDemandRpc(key), a, latest, 60).catch(() => null)
          : Promise.resolve(null),
      ]);
      return { ...balances, activity };
    },
  },
  {
    name: "getEvmNetWhaleActivity",
    description:
      "Large canonical-stablecoin (USDT/USDC) transfers on Ethereum, BSC or Arbitrum. Every " +
      "event carries its real transaction hash and block; USD = stablecoin face value.",
    parameters: [CHAIN_PARAM],
    async execute({ chain }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      return { chain: key, events: getEvmNetStore(key).get().whales.slice(0, 25) };
    },
  },
  {
    name: "getEvmNetSmartMoney",
    description:
      "Wallets ranked by verified net stablecoin flow on Ethereum, BSC or Arbitrum over a " +
      "window (inflows + mints − outflows − burns). Transfers are direction-neutral. Per-chain " +
      "computation only — no cross-chain score copying.",
    parameters: [CHAIN_PARAM, { name: "windowHours", type: "number", description: "Window in hours (default 24).", required: false }],
    async execute({ chain, windowHours }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      const hours = Math.min(720, Math.max(1, Number(windowHours) || 24));
      return { chain: key, windowHours: hours, wallets: evmNetSmartMoney(key, hours) };
    },
  },
  {
    name: "getEvmNetRadar",
    description:
      "Radar signals for Ethereum, BSC or Arbitrum: unusual volume, price movement, new pairs, " +
      "large stablecoin transfers and whale activity — each with its derivation basis.",
    parameters: [CHAIN_PARAM],
    async execute({ chain }) {
      const key = parseEvmNetChain(String(chain ?? ""));
      if (!key) return { error: "Unknown chain — use ethereum, bsc or arbitrum.", provenance: "UNAVAILABLE" as const };
      const engine = getEvmNetEngine(key);
      engine.ensureStarted();
      return { chain: key, signals: getEvmNetStore(key).get().radar };
    },
  },
];