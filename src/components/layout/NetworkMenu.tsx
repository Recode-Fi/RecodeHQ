"use client";

import { useEffect, useRef, useState } from "react";
import { useChain } from "@/providers/chain-provider";
import { ALL_NETWORKS } from "@/chains/registry";
import { ChevronDown } from "@/components/ui/icons";

export function NetworkMenu() {
  const { selected, setSelected, runtimes, selectedLabel } = useChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const activeRuntime = runtimes.find((r) => r.id === selected);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((r) => !r)}
        className="flex items-center gap-2 rounded-[4px] border border-line bg-panel-2 px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:text-text"
        title="Select network"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {activeRuntime?.icon ? (
          <span
            className="[&_svg]:h-3.5 [&_svg]:w-3.5"
            dangerouslySetInnerHTML={{ __html: activeRuntime.icon }}
          />
        ) : null}
        <span className="hidden sm:inline">{selectedLabel}</span>
        <span className="sm:hidden">{activeRuntime?.shortName ?? "NET"}</span>
        <ChevronDown width={12} height={12} />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-[6px] border border-line bg-surface p-1.5 shadow-xl shadow-black/40">
          <div className="px-2 pb-1.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
            Network
          </div>
          {[{ id: ALL_NETWORKS, name: "All Networks", note: "Aggregate every indexed network", indexed: true }, ...runtimes].map(
            (n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setSelected(n.id);
                  setOpen(false);
                }}
                className={`mb-0.5 w-full rounded-[4px] px-2 py-1.5 text-left transition-colors ${
                  selected === n.id ? "bg-green-soft text-green" : "text-muted hover:bg-panel hover:text-text"
                }`}
              >
                <span className="flex items-center justify-between text-[12px] font-medium">
                  <span className="flex items-center gap-1.5">
                    {"icon" in n && n.icon ? (
                      <span
                        className="[&_svg]:h-3.5 [&_svg]:w-3.5"
                        dangerouslySetInnerHTML={{ __html: (n as { icon: string }).icon }}
                      />
                    ) : null}
                    {n.name}
                  </span>
                  {"indexed" in n && n.indexed ? (
                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-green">
                      <span className="live-dot" /> Online
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider text-faint">Standby</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-snug text-faint">{n.note}</span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}