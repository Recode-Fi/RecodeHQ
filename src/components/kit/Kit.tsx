"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { DataStatus } from "@/lib/types";
import { EmptyState, Skeleton, SkeletonValue } from "@/components/ui/states";
import { DataBadge, Panel } from "@/components/ui/primitives";

/** Honest-state wrapper: loading skeleton / syncing / unavailable / content. */
export function StateBlock({
  status,
  loadingRows = 4,
  skeleton,
  children,
  empty,
}: {
  status: DataStatus;
  loadingRows?: number;
  skeleton?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
}) {
  if (status === "connecting" || status === "syncing") {
    return (
      <>
        {skeleton ?? (
          <div className="space-y-2">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
      </>
    );
  }
  if (status === "unavailable" || status === "unconfigured") {
    return (
      <EmptyState
        title="Data unavailable"
        message={
          status === "unconfigured"
            ? "No provider is configured for this data source. Configure it in .env.local to activate this surface."
            : "The data source did not respond. RECODE never fabricates values — this surface stays empty until verified data returns."
        }
      />
    );
  }
  if (status === "stale") {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <DataBadge status="stale" />
        </div>
        {children}
      </div>
    );
  }
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}

export interface StatDef {
  label: string;
  value: string;
  sub?: ReactNode;
  status?: DataStatus;
}

/** Global pulse metric strip — Bloomberg-style dense stat row. */
export function StatStrip({ stats }: { stats: StatDef[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="bg-panel px-4 py-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            {s.label}
          </div>
          <div className="tnum mt-1 text-[15px] font-semibold text-text">
            {s.status === "connecting" || s.status === "syncing" ? (
              <SkeletonValue w="w-20" />
            ) : (
              s.value
            )}
          </div>
          {s.sub ? <div className="mt-0.5 text-[10.5px] text-faint">{s.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function PanelHeader({
  title,
  right,
  sub,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h2>
        {sub ? <p className="mt-0.5 text-[10.5px] text-faint">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function AssetLink({ symbol, address }: { symbol: string | null; address?: string | null }) {
  const id = (symbol ?? address ?? "").toUpperCase();
  return (
    <Link href={`/app/asset/${encodeURIComponent(id)}`} className="text-green hover:underline">
      {symbol ?? "—"}
    </Link>
  );
}
