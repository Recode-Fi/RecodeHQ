import { execSync } from "node:child_process";
import fs from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
console.log("tracked files:", files.length);

// Public blockchain constants (event topic / storage slots) that match
// the private-key regex but are well-known public values:
const SAFE_CONSTANTS = new Set([
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
]);

const patterns = [
  ["alchemy-key", /alchemy\.com\/v2\/[A-Za-z0-9_-]{20,}/],
  ["helius-key", /helius[^"'\s]*\/v2\/[A-Za-z0-9_-]{20,}/i],
  ["quicknode-key", /quicknode[.a-z]*\/[0-9a-f]{16,}/i],
  ["infura-key", /infura\.io\/v3\/[A-Za-z0-9]{20,}/],
  ["bearer-token", /Bearer\s+[A-Za-z0-9_-]{25,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["private-key-hex", /0x[0-9a-fA-F]{64}/],
  ["password", /password\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ["api-key-literal", /(?:api_?key|apikey|token)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i],
  ["db-creds", /:\/\/[^\/\s:"]+:[^\/\s@"]+@[a-z]/i],
  ["sk-ant", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["sk-live", /sk_live_[A-Za-z0-9_-]{10,}/],
  ["ghp", /ghp_[A-Za-z0-9]{30,}/],
  ["gemini-ai", /AIza[A-Za-z0-9_-]{30,}/],
];

let hits = 0;
for (const f of files) {
  let content;
  try {
    content = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const [name, re] of patterns) {
    const m = content.match(re);
    if (m && !(name === "private-key-hex" && SAFE_CONSTANTS.has(m[0].toLowerCase()))) {
      hits++;
      console.log("HIT " + name + ": " + f + " -> " + m[0].slice(0, 40));
    }
  }
}
console.log(hits === 0 ? "NO SECRET PATTERNS FOUND in tracked files" : hits + " potential secrets");

const envVars = ["RECODE_SOLANA_RPC_URL", "RECODE_ARC_RPC_URL", "RECODE_ETH_RPC_URL", "RECODE_BSC_RPC_URL", "RECODE_ARBITRUM_RPC_URL"];
for (const v of envVars) {
  const assigned = files.filter((f) => {
    try {
      const c = fs.readFileSync(f, "utf8");
      return new RegExp(v + "\\s*=\\s*https?://").test(c);
    } catch {
      return false;
    }
  });
  console.log(v, assigned.length === 0 ? "not hardcoded anywhere (ok)" : "ASSIGNED in: " + assigned.join(","));
}
