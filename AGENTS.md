# RECODE project

Premium Web3 financial intelligence platform ("RECODE — Decode what moves
markets."). Next.js App Router + TypeScript + Tailwind v4, all in `src/`.
Fully independent: dedicated localhost port 5180 (auto-fallback
5181/5182/5183), own `package.json` / `node_modules` / `.env` files, and zero
imports or dependencies on sibling projects. Never reference or modify sibling
projects from this codebase.

- Dev server: `npm run dev` → `next dev --hostname localhost -p 5180`.

- Data layer: `src/services/recodeService.ts` (client bridge), hooks in
  `src/hooks/useSync.ts`. NEVER fabricate market data — UI must show
  "Data unavailable" / "Awaiting data" / SYNCING / UNAVAILABLE states when
  verified data is absent.

- Brand tokens (bg/surface/panel/line/text/muted/faint/green/neg/warn, radii)
  live in `src/app/globals.css` under `@theme`. Signal green is `#00C805`;
  green is a signal color, not a theme.

- Boot/initialization experience: `src/components/boot/InitSequence.tsx`
  (once per browser session, Esc to skip).

- Chain abstraction: `src/chains/registry.ts` — Robinhood Chain (live, 4663),
  STONK ecosystem (integration layer, NOT a blockchain), future EVM chains
  register there. UI reads network state via `ChainProvider` (`useChain`).

- Wallet connection: `src/providers/wallet-provider.tsx` — raw EIP-1193
  (`window.ethereum`), read-only (balances). No wallet SDKs, no signing/sending.

- MarketSyncEngine: `src/server/sync/` (background Robinhood Chain sync, booted
  by `src/instrumentation.ts`, env-configured providers, JSON cache in
  `.recode-cache/`, API under `src/app/api/sync/`). Interactive on-chain
  services: `onchainWalletService.ts` (live balances), `contractService.ts`
  (contract intelligence, rule-based risk — never "SAFE").

- Dynamic routes use async `params` (Next 16): `app/asset/[symbol]`,
  `app/wallet/[address]`.

- Charts are custom SVG (`src/components/charts/`) — do not add chart libraries.

- Run `npm run build` to validate; `npm run dev` for local development.
