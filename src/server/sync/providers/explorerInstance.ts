import { ExplorerProvider } from "./explorer";
import { SYNC_CONFIG } from "../config";

const g = globalThis as unknown as { __recodeExplorer?: ExplorerProvider };

/** Shared explorer (address/contract scope) instance. */
export function getExplorerProvider(): ExplorerProvider {
  g.__recodeExplorer ??= new ExplorerProvider(SYNC_CONFIG.blockscoutUrl);
  return g.__recodeExplorer;
}
