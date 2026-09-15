/**
 * ============================================================
 * $RECODE — CENTRAL TOKEN CONFIGURATION (single source of truth)
 * ============================================================
 * Everything about the RECODE token lives HERE and only here.
 * The landing-page token card, /app/token and any future token
 * surface read exclusively from this config plus the live
 * MarketSyncEngine store — never from hardcoded market values.
 *
 * ── HOW TO ACTIVATE THE TOKEN CARD ──────────────────────────
 * 1. Set `launched: true`
 * 2. Set `contractAddress: "0x<OFFICIAL_ROBINHOOD_CHAIN_ADDRESS>"`
 * 3. Set `decimals` / `totalSupply` only if fixed by the contract
 * 4. Add the same address to `markets.robinhood-chain.json`
 *    (or your configured market registry) so the engine indexes it:
 *
 *       { "address": "0x…", "symbol": "RECODE", "assetType": "other" }
 *
 * The engine then supplies price / 24h change / market cap /
 * volume / liquidity from verified sources and every token
 * surface activates automatically. Until then all token
 * surfaces show honest "Data unavailable" states.
 *
 * ── RULES ───────────────────────────────────────────────────
 * - Never place an unverified address here. null = not announced.
 * - Never pre-fill price/market-cap/volume/liquidity values.
 *   Live metrics come only from the sync engine's verified providers.
 */
export interface RecodeTokenConfig {
  /** Master switch: token is officially launched and verified. */
  launched: boolean;
  /** Official ERC-20 contract address on Robinhood Chain (null = not announced). */
  contractAddress: string | null;
  /** Fixed token facts (configuration, never market data). */
  symbol: "RECODE";
  name: string;
  description: string;
  decimals: number | null;
  /** Fixed total supply if defined by the token contract, else null. */
  totalSupply: number | null;
  /** Circulating supply is provider-derived after launch — always null here. */
  circulatingSupply: number | null;
  /** Launch network — configuration, not hardcoded in components. */
  network: {
    name: "Robinhood Chain";
    chainId: 4663;
    chainIdHex: "0x1237";
  };
  /** Official links — null until officially provided. */
  links: {
    website: string | null;
    twitter: string | null;
    explorer: string | null;
  };
  /** Which engine data source supplies live metrics after launch. */
  dataSource: "sync-engine";
}

export const RECODE_CONFIG: RecodeTokenConfig = {
  launched: false,
  contractAddress: null, // ← ADD OFFICIAL CONTRACT ADDRESS HERE (0x…, Robinhood Chain chain id 4663)

  symbol: "RECODE",
  name: "RECODE",
  description: "Native token of the RECODE intelligence platform",
  decimals: null,
  totalSupply: null,
  circulatingSupply: null,

  network: {
    name: "Robinhood Chain",
    chainId: 4663,
    chainIdHex: "0x1237",
  },

  links: {
    website: null,
    twitter: null,
    explorer: "https://robinhoodchain.blockscout.com",
  },

  dataSource: "sync-engine",
};
