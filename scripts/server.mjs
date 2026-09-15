#!/usr/bin/env node
// RECODE independent server launcher (dev + production start).
// Picks the first available port (5180 -> 5183) on IPv4 + IPv6, so RECODE
// never collides with other projects on this machine.

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const MODE = process.argv[2] === "start" ? "start" : "dev";
const PREFERRED_PORTS = [5180, 5181, 5182, 5183];

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function pickPort() {
  for (const port of PREFERRED_PORTS) {
    const freeV4 = await isPortFree(port, "127.0.0.1");
    const freeV6 = await isPortFree(port, "::1");
    if (freeV4 && freeV6) return port;
  }
  return null;
}

const port = await pickPort();
if (port == null) {
  console.error("RECODE: no available port in 5180-5183. Free one and try again.");
  process.exit(1);
}

console.log("");
console.log(`  RECODE -> http://localhost:${port}`);
console.log(`  (independent ${MODE} server | preferred port 5180 | auto-fallback 5181-5183)`);
console.log("");

const child = spawn(
  process.execPath,
  [NEXT_BIN, MODE, "--hostname", "localhost", "-p", String(port)],
  { cwd: ROOT, stdio: "inherit", env: process.env },
);

const shutdown = () => {
  if (!child.killed) child.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));
