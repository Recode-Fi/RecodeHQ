import type { RecodeAlert, AlertMetric, AlertCondition } from "@/lib/types";

/**
 * ============================================================
 * ALERT ENGINE — local evaluation layer
 * ============================================================
 * Alerts persist in the browser and are evaluated against the
 * live sync-engine data while the app is open. There is no
 * backend alert infrastructure pretending otherwise: the feed
 * status of every alert is explicit (live / awaiting / unavailable).
 */
const KEY = "recode.alerts";

function read(): RecodeAlert[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecodeAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(alerts: RecodeAlert[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(alerts));
    window.dispatchEvent(new Event("recode:alerts"));
  } catch {
    /* storage unavailable */
  }
}

export interface CreateAlertInput {
  asset: string;
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  note?: string;
}

export const alertService = {
  list(): RecodeAlert[] {
    return read().sort((a, b) => b.createdAt - a.createdAt);
  },
  create(input: CreateAlertInput): RecodeAlert {
    const alert: RecodeAlert = {
      id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ...input,
      createdAt: Date.now(),
      status: "armed",
      feedStatus: "awaiting-feed",
    };
    write([alert, ...read()]);
    return alert;
  },
  remove(id: string): void {
    write(read().filter((a) => a.id !== id));
  },
  clearTriggered(): void {
    write(read().filter((a) => a.status !== "triggered"));
  },
  setStatus(id: string, status: RecodeAlert["status"]): void {
    write(read().map((a) => (a.id === id ? { ...a, status } : a)));
  },
  /**
   * Evaluate armed alerts against a metric snapshot. Returns the updated
   * list (with newly triggered entries) — called by the alerts provider.
   */
  evaluate(
    snapshot: Map<string, { price?: number | null; volume24h?: number | null; liquidity?: number | null; holderGrowth?: number | null; whaleNetUsd?: number | null; volumeBase?: number | null }>,
  ): RecodeAlert[] {
    const alerts = read();
    let changed = false;
    for (const alert of alerts) {
      if (alert.status !== "armed") continue;
      const snap = snapshot.get(alert.asset.toUpperCase());
      if (!snap) {
        if (alert.feedStatus !== "awaiting-feed") {
          alert.feedStatus = "awaiting-feed";
          changed = true;
        }
        continue;
      }
      const current =
        alert.metric === "price"
          ? (snap.price ?? null)
          : alert.metric === "volume"
            ? (snap.volume24h ?? null)
            : alert.metric === "liquidity"
              ? (snap.liquidity ?? null)
              : alert.metric === "holder-growth"
                ? (snap.holderGrowth ?? null)
                : (snap.whaleNetUsd ?? null);
      if (current == null) {
        if (alert.feedStatus !== "awaiting-feed") {
          alert.feedStatus = "awaiting-feed";
          changed = true;
        }
        continue;
      }
      // Volume alerts support relative spikes (+X%) when a baseline exists
      let hit = false;
      if (alert.metric === "volume" && alert.condition === "change-pct" && snap.volumeBase != null && snap.volumeBase > 0) {
        hit = current >= snap.volumeBase * (1 + alert.threshold / 100);
      } else if (alert.condition === "above") {
        hit = current >= alert.threshold;
      } else if (alert.condition === "below") {
        hit = current <= alert.threshold;
      }
      alert.feedStatus = "live";
      if (hit) {
        alert.status = "triggered";
        alert.triggeredAt = Date.now();
        alert.triggeredValue = current;
        changed = true;
      }
    }
    if (changed) write(alerts);
    return alerts;
  },
};
