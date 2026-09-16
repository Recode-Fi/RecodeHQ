import fs from "node:fs";
const url = fs.readFileSync(".env.local", "utf8").match(/^RECODE_SOLANA_RPC_URL=(.+)$/m)[1].trim();
const W = String.fromCharCode(52, 68, 75, 55, 76, 97, 117, 112, 69, 52, 112, 107, 118, 75, 111, 99, 57, 101, 90, 70, 76, 72, 90, 67, 103, 71, 82, 103, 56, 90, 98, 102, 77, 105, 81, 114, 51, 121, 121, 80, 80, 74, 69, 109);
// EXACT body the app's getSignatures() builds:
const body = { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [W, { limit: 25 }] };
const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
console.log("HTTP:", r.status);
const j = await r.json();
console.log("result is array:", Array.isArray(j.result), "len:", j.result?.length ?? "null");
if (j.error) console.log("error:", JSON.stringify(j.error));
if (Array.isArray(j.result) && j.result[0]) console.log("first:", JSON.stringify(j.result[0]).slice(0, 160));