import type { SyncStore } from "../store";
import { SYNC_CONFIG } from "../config";
import type { SyncTx, SyncWhale } from "../types";
import { SOURCE_PRIORITY, type WhaleActivityProvider, type WhaleTransferEvent } from "./types";

/**
 * ============================================================
 * RECODE — whale activity sync (merge + reconcile + persist)
 * ============================================================
 * Pulls normalized transfer events from the WhaleActivityProvider
 * chain in priority order and merges them into the sync store:
 *
 *   • INSERT — new verified events (dedup by stable id + event key).
 *   • UPGRADE — when a higher-priority source re-observes an event
 *     id a lower-priority source stored first (e.g. Blockscout sees
 *     DEX pool evidence on an rpc-getlogs row), the row is upgraded
 *     in place: real timestamp, swap-evidence action, source, basis.
 *   • NEVER downgrades, never rewrites history, never fabricates.
 *
 * USD is CALCULATED from the verified RECODE price only — null when
 * no verified price exists (never zero, never a provider guess).
 */

export interface WhaleSyncOptions {
  /** Verified markets to cover (already filtered to indexed tokens). */
  markets: { address: string; symbol: string | null; decimals: number | null }[];
  /** Sliding rotation offset so every market is covered across cycles. */
  cycleIndex: number;
  /** Markets pulled per cycle. */
  maxPerCycle: number;
  /** Providers in priority order (first = highest). */
  providers: WhaleActivityProvider[];
}

export interface WhaleSyncResult {
  added: number;
  upgraded: number;
  whalesAdded: number;
  whalesUpgraded: number;
  sources: string[];
}

/** Classified wallet for an event: the non-DEX side for trades, receiver for transfers. */
export function eventWallet(ev: WhaleTransferEvent): { wallet: string; counterparty: string } {
  if (ev.action === "buy") return { wallet: ev.to, counterparty: ev.from };
  if (ev.action === "sell") return { wallet: ev.from, counterparty: ev.to };
  return { wallet: ev.to, counterparty: ev.from };
}

function priorityOf(source: string | null | undefined): number {
  if (!source) return 0; // legacy unlabeled rows — any labeled source outranks them
  return SOURCE_PRIORITY[source] ?? 0;
}

export async function syncWhaleActivity(
  store: Pick<SyncStore, "get" | "save">,
  options: WhaleSyncOptions,
): Promise<WhaleSyncResult> {
  const d = store.get();
  const markets = options.markets;
  if (markets.length === 0 || options.providers.length === 0) {
    return { added: 0, upgraded: 0, whalesAdded: 0, whalesUpgraded: 0, sources: [] };
  }

  const rotated = markets
    .slice()
    .sort(
      (a, b) =>
        (d.prices[b.address]?.marketCap ?? d.prices[b.address]?.price ?? 0) -
        (d.prices[a.address]?.marketCap ?? d.prices[a.address]?.price ?? 0),
    );
  const start = (options.cycleIndex * options.maxPerCycle) % rotated.length;
  const window = [...rotated.slice(start), ...rotated.slice(0, start)].slice(0, options.maxPerCycle);

  /* Pull from every provider. */
  const events: WhaleTransferEvent[] = [];
  const sources: string[] = [];
  for (const provider of options.providers) {
    try {
      const rows = await provider.getTransfers({ markets: window, sinceTs: 0, limitPerMarket: 50 });
      if (rows && rows.length > 0) {
        sources.push(provider.name);
        events.push(...rows);
      }
    } catch {
      /* provider failure never blocks the others */
    }
  }

  let added = 0;
  let upgraded = 0;
  let whalesAdded = 0;
  let whalesUpgraded = 0;

  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const seenEvents = new Set(
    d.transactions.map((t) => `${t.hash}:${t.wallet}:${t.action}:${t.amount ?? ""}`),
  );
  const whaleById = new Map(d.whales.map((w) => [w.id, w]));

  /* Highest priority first so upgrades happen before inserts are judged. */
  const ordered = events.sort(
    (a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0) || b.ts - a.ts,
  );

  for (const ev of ordered) {
    const price = d.prices[ev.address]?.price ?? null;
    const usd = price != null ? ev.amount * price : null;
    const { wallet, counterparty } = eventWallet(ev);
    const eventKey = `${ev.hash}:${wallet}:${ev.action}:${ev.amount}`;
    const existing = txById.get(ev.id) ?? null;

    if (existing) {
      /* Upgrade path: higher-priority source re-observing a known event. */
      if (priorityOf(ev.source) > priorityOf(existing.source)) {
        existing.action = ev.action;
        existing.source = ev.source;
        existing.basis = ev.actionBasis;
        existing.counterparty = counterparty;
        existing.wallet = wallet;
        if (ev.tsBasis === "block") {
          existing.ts = ev.ts;
          existing.tsBasis = "block";
        }
        upgraded += 1;
        const whale = whaleById.get(ev.id);
        if (whale && whale.kind !== "accumulation" && whale.kind !== "distribution") {
          whale.kind = ev.action;
          whale.source = ev.source;
          whale.basis = ev.actionBasis;
          whale.counterparty = counterparty;
          whale.wallet = wallet;
          if (ev.tsBasis === "block") {
            whale.ts = ev.ts;
            whale.tsBasis = "block";
          }
          whalesUpgraded += 1;
        }
      }
      continue;
    }

    if (seenEvents.has(eventKey)) continue;
    seenEvents.add(eventKey);

    const tx: SyncTx = {
      id: ev.id,
      hash: ev.hash,
      ts: ev.ts,
      wallet,
      action: ev.action,
      amount: ev.amount,
      usd,
      symbol: ev.symbol,
      address: ev.address,
      counterparty,
      source: ev.source,
      basis: ev.actionBasis,
      tsBasis: ev.tsBasis,
    };
    d.transactions = [tx, ...d.transactions];
    txById.set(ev.id, tx);
    added += 1;

    if (usd != null && usd >= SYNC_CONFIG.whaleThresholdUsd && !whaleById.has(ev.id)) {
      const whale: SyncWhale = {
        id: ev.id,
        hash: ev.hash,
        ts: ev.ts,
        wallet,
        symbol: ev.symbol,
        address: ev.address,
        kind: ev.action,
        usd,
        counterparty,
        source: ev.source,
        basis: ev.actionBasis,
        tsBasis: ev.tsBasis,
      };
      d.whales = [whale, ...d.whales];
      whaleById.set(ev.id, whale);
      whalesAdded += 1;
    }
  }

  d.transactions = d.transactions
    .sort((a, b) => b.ts - a.ts)
    .slice(0, SYNC_CONFIG.retention.transactions);
  d.whales = d.whales.sort((a, b) => b.ts - a.ts).slice(0, SYNC_CONFIG.retention.whales);
  if (added || upgraded || whalesAdded || whalesUpgraded) store.save();

  return { added, upgraded, whalesAdded, whalesUpgraded, sources };
}

/* ── Rule-based accumulation / distribution derivation ───── */

export interface DerivedFlowEvent extends SyncWhale {
  derived: true;
}

/**
 * Derives accumulation/distribution rows from VERIFIED transfer
 * direction (per wallet per token, 24h window): a wallet whose
 * whale-size inflow dominates outflow ≥2:1 (with ≥2 events) is
 * accumulating; the reverse is distributing. These are computed
 * labels on real transfers — never fabricated trades, and the
 * basis string explains the rule. Served at API time only (never
 * persisted), so they always reflect the current window.
 */
export function deriveFlowKinds(
  transactions: SyncTx[],
  now: number,
  windowMs = 86_400_000,
  thresholdUsd = SYNC_CONFIG.whaleThresholdUsd,
  dominance = 2,
): DerivedFlowEvent[] {
  const since = now - windowMs;
  interface Flow {
    received: number;
    sent: number;
    count: number;
    lastTs: number;
    symbol: string | null;
  }
  const flows = new Map<string, Flow>();
  for (const t of transactions) {
    if (t.ts < since || t.address == null) continue;
    if (t.usd == null || t.usd < thresholdUsd) continue;
    const wallet = t.wallet?.toLowerCase();
    const counterparty = t.counterparty?.toLowerCase();
    if (!wallet) continue;
    const key = `${t.address}:${wallet}`;
    const f =
      flows.get(key) ?? { received: 0, sent: 0, count: 0, lastTs: 0, symbol: t.symbol };
    if (counterparty && counterparty === wallet) continue; // self-transfer — no direction
    if (t.action === "sell") {
      f.sent += t.usd;
      f.count += 1;
      f.lastTs = Math.max(f.lastTs, t.ts);
      flows.set(key, f);
      continue;
    }
    // buy = received from a DEX; plain transfer rows store the receiver as wallet
    f.received += t.usd;
    f.count += 1;
    f.lastTs = Math.max(f.lastTs, t.ts);
    flows.set(key, f);

    // A plain transfer also points the other way for the counterparty.
    if (counterparty && t.action === "transfer") {
      const g =
        flows.get(`${t.address}:${counterparty}`) ??
        { received: 0, sent: 0, count: 0, lastTs: 0, symbol: t.symbol };
      g.sent += t.usd;
      g.count += 1;
      g.lastTs = Math.max(g.lastTs, t.ts);
      flows.set(`${t.address}:${counterparty}`, g);
    }
  }

  const out: DerivedFlowEvent[] = [];
  for (const [key, f] of flows) {
    if (f.count < 2) continue;
    const [address, wallet] = key.split(":");
    let kind: "accumulation" | "distribution" | null = null;
    let usd: number | null = null;
    if (f.received >= dominance * f.sent && f.received > 0) {
      kind = "accumulation";
      usd = f.received;
    } else if (f.sent >= dominance * f.received && f.sent > 0) {
      kind = "distribution";
      usd = f.sent;
    }
    if (!kind || wallet == null) continue;
    out.push({
      id: `derived:${kind}:${address}:${wallet}:${Math.floor(f.lastTs / windowMs)}`,
      ts: f.lastTs,
      wallet,
      symbol: f.symbol,
      address,
      kind,
      usd,
      counterparty: null,
      source: "derived-direction",
      basis:
        `rule-based on ${f.count} verified transfers ≥ $${thresholdUsd.toLocaleString("en-US")} in 24h: ` +
        (kind === "accumulation"
          ? `inflow $${Math.round(f.received).toLocaleString("en-US")} vs outflow $${Math.round(f.sent).toLocaleString("en-US")}`
          : `outflow $${Math.round(f.sent).toLocaleString("en-US")} vs inflow $${Math.round(f.received).toLocaleString("en-US")}`),
      tsBasis: "block",
      derived: true,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}


