/**
 * Boots the RECODE MarketSyncEngine (EVM) and the Solana intelligence
 * layer inside the Node server process. Each runs independently of the
 * browser/UI; disable with RECODE_SYNC_DISABLE=1 / RECODE_SOLANA_DISABLE=1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RECODE_SYNC_DISABLE === "1") return;
  try {
    const { getMarketSyncEngine } = await import("./server/sync/MarketSyncEngine");
    getMarketSyncEngine().start();
  } catch (err) {
    console.error("[recode] failed to start MarketSyncEngine:", err);
  }
  if (process.env.RECODE_SOLANA_DISABLE === "1") return;
  try {
    const { getSolanaSyncEngine } = await import("./server/solana/engine");
    getSolanaSyncEngine().start();
  } catch (err) {
    console.error("[recode] failed to start Solana intelligence layer:", err);
  }
}
