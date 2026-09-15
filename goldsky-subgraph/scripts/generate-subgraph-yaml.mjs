#!/usr/bin/env node
/**
 * Generates goldsky-subgraph/subgraph.yaml from the RECODE verified
 * registry (markets.robinhood-chain.json) — one data source per token,
 * startBlock 0 so holder reconstruction is provably complete.
 *
 * Usage:  node goldsky-subgraph/scripts/generate-subgraph-yaml.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const subgraphDir = path.resolve(here, "..");
const registryPath = path.resolve(subgraphDir, "..", "markets.robinhood-chain.json");
const templatePath = path.join(subgraphDir, "subgraph.template.yaml");
const outPath = path.join(subgraphDir, "subgraph.yaml");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const markets = Array.isArray(registry) ? registry : (registry.markets ?? []);
const sources = markets
  .filter((m) => /^0x[a-fA-F0-9]{40}$/.test(m.address ?? ""))
  .map((m, i) => ({
    name: `${(m.symbol ?? `token${i}`).replace(/[^a-zA-Z0-9_-]/g, "")}_${m.address.slice(2, 8)}`,
    address: m.address.toLowerCase(),
  }));

if (sources.length === 0) {
  console.error("No valid addresses found in markets.robinhood-chain.json");
  process.exit(1);
}

const template = fs.readFileSync(templatePath, "utf8");
const startMarker = "{{#dataSources}}";
const endMarker = "{{/dataSources}}";
const start = template.indexOf(startMarker);
const end = template.indexOf(endMarker);
if (start === -1 || end === -1) {
  console.error("Template is missing the {{#dataSources}}...{{/dataSources}} block");
  process.exit(1);
}
const block = sources
  .map(
    (s) => `  - kind: ethereum
    name: ${s.name}
    network: robinhood-chain
    source:
      address: "${s.address}"
      abi: ERC20
      startBlock: 0
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities: [Token, Account, TokenBalance, TransferEvent]
      abis:
        - name: ERC20
          file: ./abis/erc20.abi.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
      file: ./src/mapping.ts`,
  )
  .join("\n");

const out =
  template.slice(0, start) +
  "dataSources:\n" +
  block +
  "\n" +
  template.slice(end + endMarker.length);
fs.writeFileSync(outPath, out);
console.log(`Wrote ${outPath} with ${sources.length} token data sources.`);