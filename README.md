# RECODE — Decode what moves markets.

**[recode-fi.xyz](https://recode-fi.xyz)** · **[GitHub](https://github.com/Recode-Fi)** · **[X](https://x.com/RecodeHQ)** · **[Docs](https://recode-fi.xyz/docs)**

RECODE is an on-chain and market intelligence platform across **six live
networks** — market intelligence, scanning, asset intelligence, wallet
intelligence, whale activity, smart-money flows, radar signals and an
AI analyst — built on a strict live-data integrity contract.

**Supported networks (all live):** Solana · Ethereum · BNB Smart Chain ·
Arbitrum One · Arc (Circle) · Robinhood Chain

**Modules:** RECODE Radar · Markets · Scan · Asset Intelligence ·
Wallet Intelligence · Whale Activity · Smart Money · Signals · AI Agent.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict ·
Tailwind CSS v4 · custom SVG charts (zero chart dependencies) ·
raw EIP-1193 + Phantom/Solflare wallet connection (zero wallet SDKs).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5180 (auto-fallback 5181-5183)
npm run build    # production build
npm test         # full test suite (vitest)
npm start        # serve production build
```

Works without any API keys — every network has a working public default
provider. Optional dedicated RPCs (below) increase throughput.

## Supported networks

| Network | Family | Chain ID | Data sources |
| --- | --- | --- | --- |
| Solana | non-EVM | mainnet-beta | DexScreener (keyless) + Solana JSON-RPC |
| Ethereum | EVM | 1 | DexScreener (keyless) + Ethereum JSON-RPC |
| BNB Smart Chain | EVM | 56 | DexScreener (keyless) + BSC JSON-RPC |
| Arbitrum One | EVM | 42161 | DexScreener (keyless) + Arbitrum JSON-RPC |
| Arc (Circle) | EVM | 5042 | DexScreener (keyless) + Arc JSON-RPC; USDC gas |
| Robinhood Chain | EVM | 4663 | Robinhood Stock Token API + Blockscout + Alchemy RPC + CoinGecko |

All public endpoints are official and work without keys. Every RPC can be
overridden server-side via environment variables (see below) for production
throughput. Chain IDs and stablecoin emitters were verified on-chain before
being encoded in `src/server/evmnet/config.ts` and `src/chains/registry.ts`.

## Architecture

```
UI (chain-aware components) → hooks (useSync/useSolana/useArc/useEvmNet)
      ↓ HTTP (same-process API routes)
src/server/sync/      Robinhood Chain MarketSyncEngine
src/server/solana/    Solana intelligence layer (independent pipeline)
src/server/arc/       Arc intelligence layer (USDC-gas semantics)
src/server/evmnet/    Chain-generic EVM layer (Ethereum / BSC / Arbitrum)
      ↓
providers: DexScreener · block-native JSON-RPC · Blockscout · Alchemy ·
           CoinGecko · Gemini (AI) · optional indexer/price feed
```

- **Chain abstraction** (`src/chains/registry.ts`) — every network declares
  its address `family` (`evm` | `solana`), chain id, explorer and official
  brand icon. The global network selector is the single source of truth:
  Discover, Markets, Scanner, Asset Intelligence, Wallet Intelligence,
  Whales, Smart Money, Radar and the AI agent all follow it. Address
  families never share logic: base58 → Solana pipeline, `0x…` → the
  selected network's EVM pipeline.
- **EVM NET layer** (`src/server/evmnet/`) — one isolated engine per chain
  (own RPC, own store file, own DexScreener chain filter). Whale flows come
  from the chain's canonical stablecoin (`USDT` on Ethereum/BSC, `USDC` on
  Arbitrum) Transfer logs — every event carries its real transaction hash.
- **Arc layer** (`src/server/arc/`) — Arc-specific semantics: native USDC
  gas (18 decimals; ERC-20 interface `0x3600…0000` at 6 decimals), EIP-7708
  system-emitter whale flows, per-engine on-demand RPC isolation.
- **Solana layer** (`src/server/solana/`) — DexScreener discovery/pairs,
  holder concentration (largest accounts + supply), largest-account
  balance-delta whale events, signature-based wallet activity.
- **Wallets** — EVM via raw EIP-1193 (MetaMask/Rabby/Coinbase/Trust/Rainbow),
  Solana via Phantom/Solflare. Read-only; RECODE never signs or sends.

## API surface

`/api/sync/*` (Robinhood) · `/api/solana/*` · `/api/arc/*` ·
`/api/evm/[chain]/*` (ethereum | bsc | arbitrum) — each chain exposes
`status`, `markets`, `whales`, `radar`, `smart-money`, `token/[address]`
(direct live lookup) and `wallet/{balances,activity}`.

## Routes

| Route | Description |
| --- | --- |
| `/` | Overview — global market pulse, movers, live activity |
| `/app/discover` · `/app/markets` · `/app/assets` | Network-aware market/asset tables (filter/sort) |
| `/app/scanner` | Contract/mint scanner with direct live lookup per network |
| `/app/radar` | Per-chain radar signals with derivation bases |
| `/app/token/[mint]` · `/app/asset/[symbol]` | Token / asset intelligence |
| `/app/wallets` · `/app/wallet/[address]` | Wallet Intelligence (per selected network) |
| `/app/whales` | Whale activity feed (transfer/accumulation/distribution) |
| `/app/smart-money` | Per-chain verified net-flow ranking |
| `/app/screener` · `/app/signals` · `/app/portfolio` · `/app/watchlist` · `/app/explorer` | Screener, alerts, portfolio, watchlist, tx tape |

## Environment variables

Everything is **optional** — defaults use verified public endpoints and the
app runs keyless. See `.env.example` for the full annotated reference.
Server-side only (never exposed to the browser):

| Variable | Purpose |
| --- | --- |
| `RECODE_SOLANA_RPC_URL` | Dedicated Solana RPC (Helius/Alchemy/QuickNode) — higher throughput |
| `RECODE_ARC_RPC_URL` | Dedicated Arc RPC (default: official `rpc.mainnet.arc.io`) |
| `RECODE_ETH_RPC_URL` | Dedicated Ethereum RPC (default: publicnode) |
| `RECODE_BSC_RPC_URL` | Dedicated BSC RPC (default: publicnode — dataseed rejects logs) |
| `RECODE_ARBITRUM_RPC_URL` | Dedicated Arbitrum RPC (default: official `arb1.arbitrum.io/rpc`) |
| `ALCHEMY_API_KEY` | Robinhood Chain RPC (derived server-side) |
| `COINGECKO_API_KEY` | RWA aggregate provider (optional) |
| `GEMINI_API_KEY` / `RECODE_AGENT_MODEL` | AI agent provider (server-side only) |
| `RECODE_RPC_URL` | Robinhood Chain EVM RPC override |
| `RECODE_INDEXER_URL` / `RECODE_PRICE_FEED_URL` | Optional custom indexer / OHLCV feed |

Production (Vercel) keys are configured as project environment variables —
never committed. `RECODE_*_DISABLE=1` disables any engine for local work.

## Data integrity policy (critical)

RECODE **never fabricates** prices, market caps, volumes, liquidity, holder
counts, balances, whale events, smart-money scores, PnL or risk verdicts.
Without a verified source a surface renders **"Data unavailable"** /
**"Syncing"** — never `$0`, never another chain's data. Direct token lookups
use exact contract/mint matching only (quote-side pairs and symbol-only
matches are never substituted). Whale/smart-money events always expose their
derivation basis; per-chain computations are never copied across networks.
Unavailable history is labeled ("historical activity is limited to the
available indexed window") rather than papered over.

## Brand

- Mark: the decode motif — three chevrons parsing left-to-right into a signal; the last carries the green.
- Positioning: **Decode what moves markets.** Supporting phrase: **See the signal. Decode the market.**
- Palette: `#050505` bg · `#0b0d0c` surface · `#101311` panel · `#202521` line ·
  `#f5f7f5` text · `#00c805` signal · `#f6465d` negative · `#e2b344` warning.
- Type: Manrope (display/UI) · JetBrains Mono (data, tabular numerals).
- Dark mode is the SSR default; light mode is an opt-in saved preference
  (`<html data-theme="light">`, no first-paint flash).

## License

Private — all rights reserved unless a LICENSE file states otherwise.
