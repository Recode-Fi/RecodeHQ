"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav";
import { RecodeWordmark } from "@/components/brand/Logo";

export function SideNavSections({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav>
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="mb-4">
          <div className="px-2 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
            {section.title}
          </div>
          <ul>
            {section.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`mb-0.5 flex items-center justify-between rounded-[4px] px-2 py-1.5 text-[12.5px] transition-colors ${
                      active
                        ? "border border-green/25 bg-green-soft font-medium text-green"
                        : "border border-transparent text-muted hover:bg-panel hover:text-text"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center border-b border-line px-4">
        <Link href="/app" aria-label="RECODE App home">
          <RecodeWordmark />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <SideNavSections pathname={pathname} />
      </div>
      <div className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-faint">
        RECODE · verified data only
      </div>
    </aside>
  );
}
