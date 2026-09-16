import type { ToolDef } from "../agent/types";
import { getArcSyncEngine } from "./engine";
import { getArcOnDemandRpc } from "./rpcClient";
import { arcSmartMoney } from "./services/smartMoney";
import { getArcStore } from "./store";

/**
 * ============================================================
 * ARC — Agent tools (chain-aware: Arc = EVM, chain 5042)
 * ============================================================
 * Arc contract/wallet addresses are EVM 0x… addresses and are NEVER
 * routed to Solana tools. Every number returned comes from a verified
 * provider; missing data is null with an explicit reason.
 */

export const ARC_AGENT_TOOLS: ToolDef[] = [
  {
    name: "getArcMarkets",
    description:
      "Live Arc (chain 5042) DEX markets: tracked tokens with price, market cap, FDV, " +
      "liquidity, 24h volume, 24h change, buy/sell txns, DEX and pair address. " +
      "Optional query filters by symbol/name/contract. Null fields are unavailable — never zeros.",
    parameters: [
      { name: "query", type: "string", description: "Optional symbol/name/contract filter.", required: false },
    ],
    async execute({ query }) {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      const store = getArcStore().get();
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
        chain: "arc",
        chainId: 5042,
        gasSymbol: "USDC",
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
          dataStatus: t.updatedAt != null && Date.now() - t.updatedAt < 600_000 ? "live" : "stale",
        })),
      };
    },
  },
  {
    name: "getArcTokenIntel",
    description:
      "Analyze one Arc token by 0x… contract address: on-chain metadata (name/symbol/decimals " +
      "via Arc RPC eth_call) plus verified market data (price, liquidity, volume, change) and " +
      "pair count. A contract with no market returns metadata with an explicit no-market note.",
    parameters: [
      { name: "address", type: "string", description: "Arc token contract address (0x…).", required: true },
    ],
    async execute({ address }) {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      const { arcDirectLookup } = await import("./services/walletIntel");
      const result = await arcDirectLookup(
        engine.rpc,
        engine.dexscreener,
        String(address ?? "").trim(),
      );
      if (!result) {
        return { error: "Invalid Arc contract address (0x…, 40 hex).", provenance: "UNAVAILABLE" as const };
      }
      return { ...result, chainId: 5042, gasSymbol: "USDC" };
    },
  },
  {
    name: "getArcWalletIntel",
    description:
      "Analyze one Arc wallet (0x…): native USDC balance (gas token), USDC ERC-20 interface " +
      "balance, tracked-token holdings with verified prices, portfolio value (priced only) " +
      "and recent USDC movement records.",
    parameters: [
      { name: "address", type: "string", description: "Arc wallet address (0x…).", required: true },
    ],
    async execute({ address }) {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      const a = String(address ?? "").trim().toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
        return { error: "Invalid Arc wallet address.", provenance: "UNAVAILABLE" as const };
      }
      const { fetchArcWalletBalances } = await import("./services/walletIntel");
      const { fetchArcWalletActivity } = await import("./services/walletActivity");
      const latest = await getArcOnDemandRpc().latestBlock();
      const [balances, activity] = await Promise.all([
        fetchArcWalletBalances(getArcOnDemandRpc(), engine.dexscreener, a),
        latest != null
          ? fetchArcWalletActivity(getArcOnDemandRpc(), a, latest, 60).catch(() => null)
          : Promise.resolve(null),
      ]);
      return { ...balances, activity };
    },
  },
  {
    name: "getArcWhaleActivity",
    description:
      "Large native-USDC transfers on Arc (EIP-7708 system-emitter logs). Every event carries " +
      "its real transaction hash and block; USDC face value = USD.",
    parameters: [],
    async execute() {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      return {
        chain: "arc",
        chainId: 5042,
        events: getArcStore().get().whales.slice(0, 25),
      };
    },
  },
  {
    name: "getArcSmartMoney",
    description:
      "Arc wallets ranked by verified net USDC flow (inflows + mints − outflows − burns) over a " +
      "window. Transfers are direction-neutral. No scores/PnL are fabricated.",
    parameters: [
      { name: "windowHours", type: "number", description: "Window in hours (default 24).", required: false },
    ],
    async execute({ windowHours }) {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      const hours = Math.min(720, Math.max(1, Number(windowHours) || 24));
      return { chain: "arc", windowHours: hours, wallets: arcSmartMoney(hours) };
    },
  },
  {
    name: "getArcRadar",
    description:
      "Arc radar signals: unusual volume, price movement, new pairs, large USDC transfers and " +
      "whale activity — each with its derivation basis.",
    parameters: [],
    async execute() {
      const engine = getArcSyncEngine();
      engine.ensureStarted();
      return { chain: "arc", signals: getArcStore().get().radar };
    },
  },
];