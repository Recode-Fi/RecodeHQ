import fs from "node:fs";
// Read the RPC URL from .env.local — never printed.
const line = fs.readFileSync(".env.local", "utf8").match(/^RECODE_SOLANA_RPC_URL=(.+)$/m);
if (!line) { console.log("RECODE_SOLANA_RPC_URL: NOT SET"); process.exit(1); }
const url = line[1].trim();
const u = new URL(url);
console.log("RPC host:", u.host, "| path shape:", u.pathname.replace(/\/.{6,}$/, "/<masked>"));
const call = async (method, params) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
};
const slot = await call("getSlot");
console.log("1. getSlot:", typeof slot.result === "number" ? `✅ slot=${slot.result}` : `❌ ${JSON.stringify(slot).slice(0, 120)}`);
const bh = await call("getLatestBlockhash");
console.log("2. getLatestBlockhash:", bh.result?.value?.blockhash ? "✅ blockhash received" : `❌ ${JSON.stringify(bh).slice(0, 120)}`);
const W = "4DK7LaupE4pkvKoc9eZFLHZCgGRg8ZbfMiQr3yyPPJEm";
const bal = await call("getBalance", [W]);
console.log("3. getBalance(test wallet):", bal.result ? `✅ ${(bal.result.value / 1e9).toFixed(9)} SOL` : `❌ ${JSON.stringify(bal).slice(0, 120)}`);
const acc = await call("getTokenAccountsByOwner", [W, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]);
console.log("4. getTokenAccountsByOwner:", acc.result ? `✅ ${acc.result.value.length} accounts` : `❌ ${JSON.stringify(acc).slice(0, 120)}`);
const sigs = await call("getSignaturesForAddress", [W, { limit: 10 }]);
console.log("5. getSignaturesForAddress:", sigs.result ? `✅ ${sigs.result.length} signatures` : `❌ ${JSON.stringify(sigs).slice(0, 120)}`);
const supply = await call("getTokenSupply", ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"]);
console.log("6. getTokenSupply(BONK):", supply.result ? "✅" : `❌ ${JSON.stringify(supply).slice(0, 120)}`);
const la = await call("getTokenLargestAccounts", ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"]);
console.log("7. getTokenLargestAccounts(BONK):", la.result ? `✅ ${la.result.value.length} accounts` : `❌ ${JSON.stringify(la).slice(0, 120)}`);
// Burst test — 10 rapid calls to gauge rate-limit headroom.
const t0 = Date.now();
const burst = await Promise.all(Array.from({ length: 10 }, () => call("getSlot")));
const okBurst = burst.filter((b) => typeof b.result === "number").length;
console.log(`8. burst (10 parallel getSlot): ${okBurst}/10 ok in ${Date.now() - t0}ms`);