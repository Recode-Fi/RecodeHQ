"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { AgentPageContext } from "@/server/agent/types";

/**
 * ============================================================
 * RECODE Agent — global provider + page-context registry
 * ============================================================
 * • Mounts ONCE inside AppShell (never a navigation route).
 * • Pages register the data they already hold via
 *   `useAgentPageContext(sections, note?)` — the agent panel
 *   picks it up automatically when opened, so the user never
 *   re-types what RECODE already knows.
 */

interface AgentContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Latest page-registered context snapshot (read at send time). */
  getPageContext: () => AgentPageContext | null;
}

const AgentContext = createContext<AgentContextValue | null>(null);

/* ── Page-context registry (client module singleton) ─────── */

interface Registry {
  page: string;
  route: string | null;
  note?: string;
  sections: Record<string, Record<string, unknown>>;
}

const registry: Registry = { page: "other", route: null, sections: {} };

/** Deep-compact: drop undefined values and empty objects/arrays. */
export function compact(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const arr = value.map(compact).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = compact(v);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

/** Derive the page key from the app route. */
export function pageFromRoute(pathname: string | null): string {
  if (!pathname) return "other";
  const m = pathname.match(/^\/app\/app\/([^/]+)/);
  if (!m) return pathname === "/" ? "landing" : "other";
  const seg = m[1];
  const known = [
    "markets",
    "assets",
    "asset",
    "scanner",
    "wallet",
    "wallets",
    "whales",
    "radar",
    "signals",
    "alerts",
    "portfolio",
    "explorer",
    "screener",
    "watchlist",
    "discover",
  ];
  return known.includes(seg) ? seg : "other";
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const page = pageFromRoute(pathname);

  const getPageContext = useCallback((): AgentPageContext | null => {
    const sections = compact(registry.sections);
    const hasRoute = registry.route != null && registry.page !== "other";
    if (!sections || Object.keys(sections).length === 0) {
      return hasRoute ? { page: registry.page, route: registry.route ?? "/" } : null;
    }
    return {
      page: registry.page,
      route: registry.route ?? "/",
      note: registry.note,
      ...(sections as Omit<AgentPageContext, "page" | "route" | "note">),
    };
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({ open, setOpen, toggle, getPageContext }),
    [open, toggle, getPageContext],
  );

  /* Stale context must never leak across navigation: when the route's
     page key changes, drop the registered sections. */
  useEffect(() => {
    if (registry.page !== page || registry.route !== pathname) {
      registry.page = page;
      registry.route = pathname;
      registry.sections = {};
      registry.note = undefined;
    }
  }, [page, pathname]);

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside AgentProvider");
  return ctx;
}

/**
 * Register the current page's data with the RECODE Agent.
 * Pass ONLY data the page actually holds (undefined/empty fields are
 * dropped before the agent sees them). Re-registers on data change.
 */
export function useAgentPageContext(
  sections: Partial<
    Pick<AgentPageContext, "asset" | "contract" | "wallet" | "whale" | "signals" | "markets">
  > | null,
  note?: string,
): void {
  const pathname = usePathname();
  const key = JSON.stringify(sections ?? {});
  useEffect(() => {
    const page = pageFromRoute(pathname);
    // Guard against a stale registration racing route change cleanup.
    if (registry.page !== page && registry.page !== "other") return;
    registry.page = page;
    registry.route = pathname;
    registry.sections = (compact(sections) ?? {}) as Record<string, Record<string, unknown>>;
    registry.note = note;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pathname, note]);
}
