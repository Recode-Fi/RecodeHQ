# RECODE — Decode what moves markets.

RECODE is an intelligence platform for tokenized assets and on-chain markets —
discovery, screening, scanning, wallet intelligence, signals and monitoring for
RWAs across **Robinhood Chain** and the **STONK ecosystem**, architected for
additional EVM networks.

**Modules:** RECODE Radar · RECODE Screen · RECODE Scan · RECODE Intelligence ·
RECODE Signals · RECODE Forecast · RECODE Portfolio.
Pipeline: RAW DATA → ANALYSIS → INTELLIGENCE → SIGNAL → ACTION.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
custom SVG charts (zero chart dependencies) · EIP-1193 wallet connection (zero wallet SDKs).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5180 (auto-fallback 5181-5183)
npm run build    # production build
npm start        # serve production build
```

## Architecture

```
UI (components) → hooks (useSync) → services (recodeService)
      ↓ HTTP (same-process API routes)
src/server/sync/  MarketSyncEngine (background, booted by instrumentation.ts)
      ↓
providers: Blockscout explorer · Robinhood Stock Token API · Alchemy RPC ·
           Yahoo (underlying mcaps) · CoinGecko (RWA aggregates) · optional indexer/price feed

UI (Solana surfaces) → hooks (useSolana) → services (solanaService)
      ↓ HTTP (same-process API routes)
src/server/solana/  SolanaSyncEngine (background, booted by instrumentation.ts)
      ↓
providers: DexScreener (keyless DEX market data) · Solana JSON-RPC (mainnet-beta)
```

- **MarketSyncEngine** (`src/server/sync/`) — discovery (5m), metadata (2m), prices (15s),
  candles (60s, lazy), transactions (5s), whales (10s), holders (5m), prune (30m).
  Durable JSON cache in `.recode-cache/` (gitignored). Disable with `RECODE_SYNC_DISABLE=1`.
- **Chain abstraction** (`src/chains/`) — `solana` (live, non-EVM), `robinhood` (live,
  chain 4663), `stonk` (ecosystem integration layer, not a blockchain), `shared` taxonomy.
  Networks register in `src/chains/registry.ts` (each declares its address `family`:
  `evm` | `solana`); the network selector and every page adapt automatically. No
  chain-specific logic in the UI.
- **Wallet** (`src/providers/wallet-provider.tsx`) — raw EIP-1193 (`window.ethereum`):
  connect, chain verification (0x1237). Read-only; RECODE never signs or sends.
  **Solana wallets** (`src/providers/solana-wallet-provider.tsx`) — separate raw provider
  APIs (`window.phantom.solana` / `window.solflare`), read-only (public key only), never
  mixed with EVM address logic (`src/lib/types.ts → addressFamily`).
- **Solana intelligence layer** (`src/server/solana/`) — independent pipeline for Solana
  mainnet-beta: DexScreener token discovery (profiles/boosts) + live DEX pairs (price,
  market cap, liquidity, 24h volume, buy/sell txns, 24h change, DEX/pair info, logos),
  Solana JSON-RPC for holder concentration (largest accounts + supply) and whale events
  (rule-based largest-account balance deltas), radar signals (unusual volume, liquidity
  changes, large transfers, price movement, newly active pairs) and wallet intelligence
  (SOL + SPL balances, signature activity). JSON cache `.recode-cache/solana-store.json`.
  Disable with `RECODE_SOLANA_DISABLE=1`; set `RECODE_SOLANA_RPC_URL` for production RPC.
  Missing provider fields stay null — never 0, never fabricated.
- **API**: `/api/sync/{status,overview,markets,candles,transactions,whales,holders,rwa-aggregates}`,
  `/api/wallet/balances` (live RPC balances), `/api/wallet/activity` (explorer),
  `/api/contract` (contract intelligence + rule-based risk),
  `/api/solana/{status,markets,token/[mint],whales,radar}`,
  `/api/solana/wallet/{balances,activity}` (Solana address family only).

## Routes

| Route | Description |
| --- | --- |
| `/` | Overview — Global Market Pulse, movers, live activity |
| `/markets` · `/screener` · `/discover` · `/assets` | Verified market tables (filter/sort) |
| `/stocks` `/etfs` `/treasuries` `/commodities` `/stablecoins` | Asset-class registries |
| `/radar` | RECODE Radar — momentum × market-cap map, hover intelligence |
| `/asset/[symbol]` | Asset Intelligence — chart, holders, transactions, whales |
| `/wallets` · `/wallet/[address]` | Wallet Intelligence — live RPC balances + activity |
| `/portfolio` | Connected-wallet portfolio (read-only) |
| `/smart-money` | Wallet net-flow ranking from verified flows |
| `/whales` | Whale activity feed (buy/sell/transfer/accumulation/distribution) |
| `/stonk` | STONK ecosystem intelligence (honest pre-wiring states) |
| `/alerts` | Local alert engine (price/volume/liquidity conditions) |
| `/scanner` | RECODE Scan (contract scanner) — verification, ownership, risk verdict |
| `/explorer` | Live transaction tape |
| `/watchlist` | Saved assets / wallets / contracts |

## Environment variables (`.env.local`, see `.env.example`)

| Variable | Purpose |
| --- | --- |
| `ALCHEMY_API_KEY` | Robinhood Chain RPC (metadata, wallet balances, scanner). Server-side only. |
| `RECODE_RPC_URL` | Explicit EVM RPC override (falls back to ALCHEMY_RPC_URL → Alchemy key) |
| `RECODE_CHAIN_ID` | Server chain id (default 4663) |
| `NEXT_PUBLIC_RECODE_CHAIN_ID` | Expected chain id hex for wallet verification (`0x1237`) |
| `RECODE_INDEXER_URL` | Optional REST indexer (wallets, liquidity) |
| `RECODE_PRICE_FEED_URL` | Optional OHLCV feed (observed ticks aggregate without it) |
| `RECODE_MARKET_LIST_URL` / `markets.robinhood-chain.json` | Optional market registry |
| `RECODE_BLOCKSCOUT_URL` | Explorer override (default `https://robinhoodchain.blockscout.com`) |
| `RECODE_ROBINHOOD_API_URL` | Official stock-token API override |
| `COINGECKO_API_KEY` / `RWA_XYZ_API_URL` | Optional aggregate providers (server-side) |

## Data integrity policy (critical)

RECODE **never fabricates** prices, market caps, volumes, liquidity, TVL, holder
counts, balances, whale events, PnL or risk verdicts. Without a verified source a
surface renders **"Data unavailable"**, **"Awaiting data"** or **"Syncing"** — never
`$0`, never simulated numbers. The STONK page activates only from verified contracts
and providers. Wallet behavioral labels and the contract risk verdict are rule-based
over verified evidence and expose UNKNOWN/insufficient-data as first-class outcomes.

## Brand

- Mark: the decode motif — three chevrons parsing left-to-right into a signal; the last carries the green.
- Positioning: **Decode what moves markets.** Supporting phrase: **See the signal. Decode the market.**
- Palette: `#050505` bg · `#0b0d0c` surface · `#101311` panel · `#202521` line ·
  `#f5f7f5` text · `#00c805` signal · `#f6465d` negative · `#e2b344` warning.
- Type: Manrope (display/UI) · JetBrains Mono (data, tabular numerals).

## RECODE Token configuration

The $RECODE token is configured in `src/lib/recodeConfig.ts` (single source of
truth). The landing-page token card and `/app/token` both read from it plus the
MarketSyncEngine store - one data pipeline, no secondary price system.

To activate the token card after launch: set `launched: true` and
`contractAddress` in `src/lib/recodeConfig.ts`, and add the contract to
`markets.robinhood-chain.json` so the engine indexes it. Until then all token
metrics show honest "Data unavailable" states - values are never estimated.

Light mode: the design system supports an opt-in centralized light theme via
`<html data-theme="light">` (see `globals.css`). Default remains dark.
