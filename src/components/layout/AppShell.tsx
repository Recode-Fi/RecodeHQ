"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MOBILE_NAV } from "@/lib/nav";
import { useCommandPalette } from "@/components/layout/useCommandPalette";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NetworkMenu } from "@/components/layout/NetworkMenu";
import { ConnectWalletButton } from "@/components/layout/ConnectButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { RecodeWordmark } from "@/components/brand/Logo";
import { DesktopNav, SideNavSections } from "@/components/layout/SideNav";
import { useEngineStatus } from "@/hooks/useSync";
import { fmtNum } from "@/lib/format";
import { updatedSecondsAgo } from "@/lib/market-math";
import { useNow } from "@/components/ui/LiveStatus";
import {
  SearchIcon,
  BellIcon,
  HomeIcon,
  GridIcon,
  RadarIcon,
  WalletIcon,
  MenuIcon,
  CloseIcon,
} from "@/components/ui/icons";

const MOBILE_ICONS = [HomeIcon, RadarIcon, GridIcon, WalletIcon, MenuIcon];

function EngineRibbon() {
  const { data } = useEngineStatus();
  const now = useNow(1_000);
  const mode = data?.mode ?? "standby";
  const lastSync = data?.updatedAt ?? null;
  const age = updatedSecondsAgo(lastSync, now);
  const dotStyle =
    mode === "live"
      ? undefined
      : { background: "var(--color-warn)", animation: "none" as const };
  return (
    <div className="hidden items-center gap-3 border-b border-line-soft bg-surface/60 px-4 py-1.5 text-[10.5px] text-faint md:flex">
      <span className="flex items-center gap-1.5">
        <span className="live-dot" style={dotStyle} />
        MARKET SYNC ENGINE · {mode.toUpperCase()}
      </span>
      <span className="text-line">|</span>
      <span className="tnum">
        Last sync: {lastSync != null ? (age ?? "—") : "awaiting first sync"}
      </span>
      <span className="text-line">|</span>
      <span className="tnum">{fmtNum(data?.marketsIndexed ?? null)} markets indexed</span>
      <span className="text-line">|</span>
      <span className="tnum">chain {data?.chainId ?? "—"}</span>
    </div>
  );
}

function MobileBottomNav({
  pathname,
  onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] border-t border-line bg-bg/95 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item, i) => {
          const active =
            item.href === "__more"
              ? false
              : item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
          const Icon = MOBILE_ICONS[i] ?? HomeIcon;
          return (
            <li key={item.label}>
              {item.href === "__more" ? (
                <button
                  type="button"
                  onClick={onMore}
                  className="flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] text-muted"
                >
                  <Icon width={18} height={18} />
                  {item.label}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${
                    active ? "text-green" : "text-muted"
                  }`}
                >
                  <Icon width={18} height={18} />
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <DesktopNav pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4">
            <button
              type="button"
              className="rounded-[4px] border border-line bg-panel p-1.5 text-muted lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon />
            </button>
            <Link href="/app" className="lg:hidden" aria-label="RECODE App">
              <RecodeWordmark compact />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="tnum flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-[4px] border border-line bg-panel px-3 text-left text-[12.5px] text-faint transition-colors hover:border-line-strong lg:max-w-md"
            >
              <SearchIcon width={13} height={13} />
              <span className="truncate">Search assets, wallets, contracts…</span>
              <kbd className="ml-auto hidden rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] sm:block">
                ⌘K
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <NetworkMenu />
              <Link
                href="/app/alerts"
                className="rounded-[4px] border border-line bg-panel-2 p-1.5 text-muted transition-colors hover:text-text"
                title="Alerts"
              >
                <BellIcon />
              </Link>
              <ConnectWalletButton />
            </div>
          </div>
          <EngineRibbon />
        </header>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 lg:px-7 lg:pb-14">{children}</main>
        <footer className="hidden border-t border-line px-7 py-4 text-[10.5px] text-faint lg:block">
          RECODE · Decode what moves markets · Verified on-chain data only — no fabricated numbers
        </footer>
      </div>

      <MobileBottomNav pathname={pathname} onMore={() => setNavOpen(true)} />

      {navOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden" onClick={() => setNavOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-line bg-surface p-4 pb-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <RecodeWordmark />
              <button type="button" onClick={() => setNavOpen(false)} className="text-faint">
                <CloseIcon />
              </button>
            </div>
            <SideNavSections pathname={pathname} onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
