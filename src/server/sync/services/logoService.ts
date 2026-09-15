import { SYNC_CONFIG } from "../config";
import type { SyncStore } from "../store";

type ProbeResult = "ok" | "missing" | "netfail";

const PROBE_TIMEOUT_MS = 5_000;
/** Parallel probe batch â€” bounded so logo checks never storm providers. */
const BATCH = 6;

async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": SYNC_CONFIG.userAgent, accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return "missing";
    return (res.headers.get("content-type") ?? "").startsWith("image/") ? "ok" : "missing";
  } catch {
    return "netfail";
  }
}

/**
 * Asset logo resolution. For every indexed market, picks the best reachable
 * logo and stores it â€” candidates, in order:
 *
 *   1. official asset-metadata logo (Robinhood CDN, from Blockscout/RHJ)
 *   2. keyless per-symbol provider, derived from the asset's own symbol
 *
 * There is no hardcoded per-symbol list: the fallback URL is built from the
 * market's symbol, so newly indexed assets resolve automatically. Markets
 * with no reachable logo store `null` and the UI renders a neutral
 * ticker-initials monogram â€” never a brand logo and never a fake image.
 *
 * Cycle-level reachability memo: one network-level failure (blocked host)
 * skips remaining probes for that host this cycle, so a blocked CDN costs a
 * single ~5s probe instead of one per market.
 */
export async function syncLogos(store: SyncStore): Promise<void> {
  const d = store.get();
  const now = Date.now();
  const pending = Object.values(d.markets).filter(
    (m) => !d.logos[m.address] || now - d.logos[m.address].checkedAt >= SYNC_CONFIG.logoRecheckMs,
  );
  if (pending.length === 0) return;

  let cdnReachable: boolean | null = null;
  let fallbackReachable: boolean | null = null;

  const resolve = async (symbol: string | null, metaUrl: string | null): Promise<string | null> => {
    // 1 â€” official asset metadata logo
    if (metaUrl && cdnReachable !== false) {
      const r = cdnReachable === true ? "ok" : await probe(metaUrl);
      if (r === "ok") {
        cdnReachable = true;
        return metaUrl;
      }
      if (r === "netfail") {
        cdnReachable = false;
      }
      // "missing" is asset-specific â€” fall through
    }
    // 2 â€” keyless per-symbol provider (symbol-derived, never hardcoded)
    const sym = (symbol ?? "").trim().toUpperCase();
    if (!sym || fallbackReachable === false) return null;
    const fb = `${SYNC_CONFIG.logoBaseUrl}/${encodeURIComponent(sym)}`;
    const r = await probe(fb);
    if (r === "ok") {
      fallbackReachable = true;
      return fb;
    }
    if (r === "netfail") fallbackReachable = false;
    return null;
  };

  let updated = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((m) => resolve(m.symbol, m.logoUrl)));
    results.forEach((url, idx) => {
      d.logos[slice[idx].address] = { url, checkedAt: now };
      if (url) updated += 1;
    });
  }
  store.save();
  console.log(
    `[recode] logos: resolved ${updated}/${pending.length} pending (of ${Object.keys(d.markets).length} markets)`,
  );
}
