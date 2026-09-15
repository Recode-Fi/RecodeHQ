import type { WatchEntry } from "@/lib/types";

/**
 * Watchlist — browser-local persistence (assets / wallets / contracts).
 * Columns (price, 24h, volume…) come from live engine data at render time;
 * this service only stores what the user saved.
 */
const KEY = "recode.watchlist";

function read(): WatchEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: WatchEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event("recode:watchlist"));
  } catch {
    /* storage unavailable */
  }
}

export const watchlistService = {
  list(): WatchEntry[] {
    return read();
  },
  has(kind: WatchEntry["kind"], id: string): boolean {
    return read().some((e) => e.kind === kind && e.id.toLowerCase() === id.toLowerCase());
  },
  add(kind: WatchEntry["kind"], id: string, label: string): void {
    const entries = read();
    if (entries.some((e) => e.kind === kind && e.id.toLowerCase() === id.toLowerCase())) return;
    write([{ kind, id, label, addedAt: Date.now() }, ...entries]);
  },
  remove(kind: WatchEntry["kind"], id: string): void {
    write(read().filter((e) => !(e.kind === kind && e.id.toLowerCase() === id.toLowerCase())));
  },
  toggle(kind: WatchEntry["kind"], id: string, label: string): boolean {
    if (watchlistService.has(kind, id)) {
      watchlistService.remove(kind, id);
      return false;
    }
    watchlistService.add(kind, id, label);
    return true;
  },
  clear(): void {
    write([]);
  },
};
