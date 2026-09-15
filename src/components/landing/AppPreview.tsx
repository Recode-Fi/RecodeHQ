"use client";

import Link from "next/link";
import { DashboardView } from "@/components/dashboard/DashboardView";

/**
 * Live preview of the actual RECODE app (real dashboard component, real
 * verified data - honest empty states when feeds are unavailable).
 */
export function AppPreview() {
  return (
    <div className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="tnum ml-3 rounded-[4px] border border-line bg-bg px-3 py-1 text-[10.5px] text-faint">
          recode · app
        </span>
        <Link href="/app" className="ml-auto text-[11px] font-semibold text-green hover:underline">
          Open full app →
        </Link>
      </div>
      <div className="max-h-[560px] overflow-hidden">
        <DashboardView />
      </div>
    </div>
  );
}
