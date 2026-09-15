/**
 * ============================================================
 * RECODE — trading session derivation (pure, unit-tested)
 * ============================================================
 * Stock Tokens do NOT all follow plain NYSE hours: the official
 * Robinhood asset registry exposes per-asset tradingCapabilities
 * (day session / extended hours / overnight). This module derives
 * an honest per-asset status from that metadata plus the exchange
 * clock — never from assumptions.
 *
 * Derivation (documented, deterministic):
 *   1. isTradingHalt === true            → "HALTED"   (provider-flagged)
 *   2. capability "24/5" or "overnight"  → overnight windows (20:00–04:00 ET)
 *                                           are tradable → "OVERNIGHT"
 *   3. capability "extended"             → extended windows (04:00–09:30,
 *                                           16:00–20:00 ET) → "EXTENDED HOURS"
 *   4. 09:30–16:00 ET, Mon–Fri           → "MARKET OPEN" (core session)
 *   5. otherwise                          → "CLOSED"
 *   6. no capability metadata at all     → only core-session logic is
 *                                           applied; capability-dependent
 *                                           windows collapse to "CLOSED"
 *                                           (never invented as open)
 */

export type TradingStatus =
  | "HALTED"
  | "MARKET OPEN"
  | "EXTENDED HOURS"
  | "OVERNIGHT"
  | "CLOSED"
  | "UNKNOWN";

export interface TradingSessionInput {
  halted?: boolean | null;
  /** Raw capability strings from the official asset registry. */
  capabilities?: string[] | null;
  /** Epoch ms at which to evaluate the session (defaults: call site passes Date.now()). */
  now: number;
}

/** Minutes since midnight ET for a given epoch (DST-safe via Intl). */
export function etMinutesOfDay(now: number): { minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(now));
  let minutes = 0;
  let weekday = 0;
  for (const p of parts) {
    if (p.type === "hour") minutes += Number(p.value) * 60;
    else if (p.type === "minute") minutes += Number(p.value);
    else if (p.type === "weekday") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      weekday = Math.max(0, days.indexOf(p.value));
    }
  }
  return { minutes, weekday };
}

function hasCapability(caps: string[] | null | undefined, ...needles: string[]): boolean {
  if (!caps || caps.length === 0) return false;
  const norm = caps.map((c) => c.toLowerCase());
  return needles.some((n) => norm.some((c) => c.includes(n)));
}

export function tradingStatusOf(input: TradingSessionInput): TradingStatus {
  if (input.halted === true) return "HALTED";
  const { minutes, weekday } = etMinutesOfDay(input.now);
  const isWeekday = weekday >= 1 && weekday <= 5;
  const core = isWeekday && minutes >= 570 && minutes < 960; // 09:30–16:00 ET
  if (core) return "MARKET OPEN";
  const extendedWindow = isWeekday && ((minutes >= 240 && minutes < 570) || (minutes >= 960 && minutes < 1200));
  const overnightWindow = isWeekday && (minutes >= 1200 || minutes < 240);
  const supportsExtended = hasCapability(input.capabilities, "extended");
  const supportsOvernight = hasCapability(input.capabilities, "overnight", "24/5", "24hr", "24h");
  if (overnightWindow && supportsOvernight) return "OVERNIGHT";
  if (extendedWindow && supportsExtended) return "EXTENDED HOURS";
  return "CLOSED";
}

/** Short UI label for a capability list (honest "—" when unknown). */
export function sessionLabel(capabilities: string[] | null | undefined): string {
  if (!capabilities || capabilities.length === 0) return "—";
  const supportsOvernight = hasCapability(capabilities, "overnight", "24/5", "24hr", "24h");
  if (supportsOvernight) return "24/5 trading";
  if (hasCapability(capabilities, "extended")) return "Extended hours";
  return "Standard hours";
}
