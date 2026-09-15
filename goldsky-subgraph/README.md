# RECODE — Robinhood Chain Holder Subgraph (Goldsky, PRIMARY indexer)

Goldsky officially supports **Robinhood Chain mainnet (chain 4663)** with hosted
Subgraphs (see https://goldsky.com/chains — "Robinhood Chain: Mainnet, Testnet —
Subgraphs, Turbo, Compose, Edge"). This folder contains the RECODE subgraph that
indexes every verified Robinhood Stock Token for **holders, balances and
transfers** — the data RECODE's Scan/Intelligence pages need.

Pricing: **$100 free credits on signup, no credit card** (goldsky.com/pricing).

## One-time setup (manual, ~5 minutes)

```bash
cd goldsky-subgraph

# 1. Create a free Goldsky account at https://app.goldsky.com
#    → Settings → API keys → copy your personal access token, then:
npx @goldskydev/cli@latest auth login    # paste the token when prompted

# 2. Install deps (graph-cli + graph-ts)
npm install

# 3. Generate subgraph.yaml from the verified registry and deploy
npm run deploy
#    → runs scripts/generate-subgraph-yaml.mjs, graph codegen,
#      and `goldsky subgraph deploy recode-robinhood-holders/1.0.0`
```

The CLI prints a hosted **GraphQL endpoint** like:

```
https://api.goldsky.com/api/public/project_<your-id>/subgraphs/recode-robinhood-holders/1.0.0/gn
```

## Activate it in RECODE

```bash
# local
echo "RECODE_GOLDSKY_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_<id>/subgraphs/recode-robinhood-holders/1.0.0/gn" >> .env.local

# Vercel Production
vercel env add RECODE_GOLDSKY_SUBGRAPH_URL production
# paste the endpoint when prompted, then redeploy: vercel --prod
```

`RECODE_GOLDSKY_SUBGRAPH_URL` is **server-only** (read via `SYNC_CONFIG`, never
sent to the browser). Once set, the Goldsky subgraph becomes the PRIMARY holder
provider: REST indexer → cache → Blockscout → stale cache follow as fallbacks.

## What it indexes

- `Token` — symbol/name/decimals (metadata pass), totalSupply (supply events),
  holderCount, transferCount
- `TokenBalance` — per (token, account) balance reconstructed from **genesis
  Transfer events** (startBlock 0 → provably complete)
- `TransferEvent` — raw ERC-20 Transfer log with timestamp/txHash
  (RECODE never relabels these as buys/sells)

## Adding new tokens

Add them to `markets.robinhood-chain.json` (the verified registry), then
re-run `npm run deploy` in this folder.

## Notes

- Network slug is `robinhood-chain` (Goldsky CLI name for chain 4663 mainnet).
- If `graph codegen` reports an apiVersion mismatch, align `apiVersion` in
  subgraph.yaml with your graph-cli version.
- Burn addresses (0x0 / 0xdEaD) are tracked in totalSupply but never returned
  as whales by RECODE.