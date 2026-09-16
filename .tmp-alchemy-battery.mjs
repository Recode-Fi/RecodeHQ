const base = "http://localhost:5180";
const W = String.fromCharCode(52, 68, 75, 55, 76, 97, 117, 112, 69, 52, 112, 107, 118, 75, 111, 99, 57, 101, 90, 70, 76, 72, 90, 67, 103, 71, 82, 103, 56, 90, 98, 102, 77, 105, 81, 114, 51, 121, 121, 80, 80, 74, 69, 109);
console.log("wallet len:", W.length);
const out = [];
const push = (n, v) => out.push(n + ": " + v);
const j = async (p) => fetch(base + p, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json());

const b = await j(`/api/solana/wallet/balances?address=${W}`);
if (!b.data) { console.log("balances FAILED:", JSON.stringify(b).slice(0, 300)); process.exit(1); }
push("balances", `${b.status} online=${b.data.chainOnline} holdings=${b.data.holdings.length} priced=${b.data.pricedCount} total=$${(b.data.totalValueUsd ?? 0).toFixed(2)}`);
for (const h of b.data.holdings) {
  push(`  [${h.kind}] ${h.symbol ?? h.mint?.slice(0, 10)}`, `amount=${h.amount} price=${h.priceUsd} value=${h.valueUsd == null ? "—" : h.valueUsd.toFixed(4)} status=${h.status}`);
}
const a = await j(`/api/solana/wallet/activity?address=${W}&limit=15`);
push("activity", `${a.status} records=${a.data.recordsCount} detailsNA=${a.data.detailsUnavailable}`);
for (const r of a.data.records.slice(0, 5)) {
  push(`  [${r.label}] ${r.program ?? "-"}`, `sol=${r.solAmount == null ? "-" : r.solAmount.toFixed(5)} usd=${r.usd == null ? "—" : r.usd.toFixed(2)}`);
}
const s = await j("/api/solana/status");
push("engine", `mode=${s.mode} tokens=${s.tokensIndexed} whales=${s.whalesStored} signals=${s.signalsStored}`);
const sc = await j("/api/solana/scanner");
push("scanner", `${sc.status} rows=${sc.data ? sc.data.length : 0}`);
const rd = await j("/api/solana/radar");
push("radar", `${rd.status} signals=${rd.data ? rd.data.length : 0}`);
const sm = await j("/api/solana/smart-money");
push("smart-money", `${sm.status} wallets=${sm.data ? sm.data.length : 0}${sm.error ? "" : ""}`);
const wh = await j("/api/solana/whales");
push("whales", `${wh.status} events=${wh.data ? wh.data.length : 0}`);
console.log(out.join("\n"));