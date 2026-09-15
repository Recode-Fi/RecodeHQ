import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { RecodeMark } from "@/components/brand/Logo";
import { ConnectWalletButton } from "@/components/layout/ConnectButton";
import { HeroSection, PipelineStrip } from "@/components/landing/Hero";
import { WhatIsSection, ProductsSection, RwaSection } from "@/components/landing/Sections";
import { TokenSection } from "@/components/landing/TokenSection";
import {
  SeeAppSection,
  HowItWorksSection,
  EcosystemsSection,
  FinalCta,
} from "@/components/landing/Sections2";

export const metadata: Metadata = {
  title: { absolute: "RECODE — Decode What Moves Markets" },
  description:
    "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
  openGraph: {
    title: "RECODE — Decode What Moves Markets",
    description:
      "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
    siteName: "RECODE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RECODE — Decode What Moves Markets",
    description:
      "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
  },
};

const FOOTER_NAV = [
  { label: "Overview", href: "/app" },
  { label: "Markets", href: "/app/markets" },
  { label: "Discover", href: "/app/discover" },
  { label: "Radar", href: "/app/radar" },
  { label: "Scan", href: "/app/scanner" },
  { label: "Asset Intelligence", href: "/app/assets" },
  { label: "Signals", href: "/app/signals" },
  { label: "Portfolio", href: "/app/portfolio" },
];

export default function LandingPage() {
  const external = [
    { label: "Documentation", url: process.env.NEXT_PUBLIC_RECODE_DOCS_URL },
    { label: "GitHub", url: process.env.NEXT_PUBLIC_RECODE_GITHUB_URL },
    { label: "X / Twitter", url: process.env.NEXT_PUBLIC_RECODE_TWITTER_URL },
  ];
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <RecodeMark size={20} />
            <span className="text-[14px] font-extrabold tracking-[0.2em]">RECODE</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[12.5px] text-muted md:flex">
            <a href="#products" className="transition-colors hover:text-text">Products</a>
            <a href="#rwa" className="transition-colors hover:text-text">RWA</a>
            <a href="#app" className="transition-colors hover:text-text">App</a>
            <a href="#how" className="transition-colors hover:text-text">How it works</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ConnectWalletButton />
            <Link
              href="/app"
              className="rounded-[4px] btn-accent px-3.5 py-1.5 text-[12px] font-semibold text-green transition-colors"
            >
              RECODE App
            </Link>
          </div>
        </div>
      </header>

      <HeroSection />
      <PipelineStrip />
      <WhatIsSection />
      <ProductsSection />
      <RwaSection />
      <TokenSection />
      <SeeAppSection />
      <HowItWorksSection />
      <EcosystemsSection />
      <FinalCta />

      <footer className="bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <RecodeMark size={22} />
              <span className="text-[15px] font-extrabold tracking-[0.2em]">RECODE</span>
            </div>
            <p className="mt-2 text-[12px] text-muted">Decode what moves markets.</p>
            <p className="mt-3 max-w-xs text-[10.5px] leading-relaxed text-faint">
              Intelligence for tokenized assets and on-chain markets. Independent platform - not
              affiliated with Robinhood Markets, Inc. or any ecosystem mentioned.
            </p>
          </div>
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Product
            </div>
            <ul className="space-y-2">
              {FOOTER_NAV.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-[12.5px] text-muted transition-colors hover:text-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Resources
            </div>
            <ul className="space-y-2">
              {external.map((l) =>
                l.url ? (
                  <li key={l.label}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12.5px] text-muted transition-colors hover:text-text"
                    >
                      {l.label} ↗
                    </a>
                  </li>
                ) : (
                  <li key={l.label} className="text-[12.5px] text-faint" title="Configure NEXT_PUBLIC_RECODE_*_URL to enable">
                    {l.label}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-line-soft">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-4 text-[10.5px] text-faint">
            <span>
              © {new Date().getFullYear()} RECODE · All data across the platform comes from
              verified sources or explicit unavailable states.
            </span>
            <span>See the signal. Decode the market.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
