/** Shared display formatters — tabular, terminal-grade, locale-stable (en). */

const NF_COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const NF_INT = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${NF_COMPACT.format(abs)}`;
  if (abs >= 1) return `${sign}$${abs.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  return `${sign}$${abs.toFixed(abs < 0.01 ? 6 : 4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `$${v.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 10_000) return NF_COMPACT.format(v);
  if (Number.isInteger(v)) return NF_INT.format(v);
  return v.toLocaleString("en", { maximumFractionDigits: 4 });
}

export function fmtPct(v: number | null | undefined, withSign = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtAmount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return NF_COMPACT.format(v);
  if (Math.abs(v) >= 1) return v.toLocaleString("en", { maximumFractionDigits: 4 });
  return v.toLocaleString("en", { maximumFractionDigits: 6 });
}

export function shortAddr(a: string | null | undefined, head = 6, tail = 4): string {
  if (!a) return "—";
  return a.length > head + tail + 2 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

/** Alias for address/hash shortening in feeds and tables. */
export const shortHash = shortAddr;

export function timeAgo(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 30_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function fmtClock(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDate(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

export function statusWord(status: string): string {
  switch (status) {
    case "live": return "LIVE";
    case "syncing": return "SYNCING";
    case "connecting": return "CONNECTING";
    case "stale": return "STALE";
    case "unavailable": return "UNAVAILABLE";
    case "unconfigured": return "NOT CONFIGURED";
    default: return "—";
  }
}

/** Tailwind tone class for a signed percentage. */
export function changeTone(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "text-muted";
  return v > 0 ? "text-pos" : "text-neg";
}

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function explorerTxUrl(base: string | null, hash: string): string | null {
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null;
}

export function explorerAddrUrl(base: string | null, address: string): string | null {
  return base ? `${base.replace(/\/$/, "")}/address/${address}` : null;
}
