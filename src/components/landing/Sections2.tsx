import Link from "next/link";
import { AppPreview } from "@/components/landing/AppPreview";

const STEPS = [
  { n: "01", t: "Discover", d: "Find markets and tokenized assets." },
  { n: "02", t: "Radar", d: "Track movements using verified data." },
  { n: "03", t: "Analyze", d: "Understand wallets, liquidity, holders and activity." },
  { n: "04", t: "Decode", d: "Turn signals into market intelligence." },
];

export function SeeAppSection() {
  return (
    <section id="app" className="border-b border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.01em] text-text">See the app</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] text-muted">
            A live view of the RECODE intelligence terminal - real verified data, honest states,
            no fabricated numbers.
          </p>
        </div>
        <AppPreview />
        <div className="mt-8 text-center">
          <Link
            href="/app"
            className="inline-block rounded-[4px] btn-accent px-7 py-3 text-[13px] font-semibold text-green transition-colors"
          >
            Launch RECODE
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-[-0.01em] text-text">How it works</h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="fade-up rounded-[6px] border border-line bg-panel p-5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="tnum text-[22px] font-extrabold text-green/70">{s.n}</div>
              <h3 className="mt-2 text-[14px] font-bold text-text">{s.t}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ECOSYSTEMS = [
  { name: "Robinhood Chain", state: "Live intelligence coverage", desc: "Tokenized stocks, ETFs and RWAs indexed from on-chain sources." },
  { name: "STONK ecosystem", state: "Integration layer", desc: "Ecosystem intelligence on shared tokenized-market infrastructure." },
  { name: "Future networks", state: "Architecture-ready", desc: "The chain abstraction supports additional EVM ecosystems." },
];

export function EcosystemsSection() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl font-bold tracking-[-0.01em] text-text">
          Built to bring intelligence across supported tokenized-asset ecosystems.
        </h2>
        <p className="mt-3 max-w-2xl text-[13px] text-faint">
          RECODE is an independent platform. Ecosystem names are used to describe technical
          compatibility only - no affiliation or endorsement is implied.
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {ECOSYSTEMS.map((e, i) => (
            <div
              key={e.name}
              className="fade-up rounded-[6px] border border-line bg-panel p-6"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <h3 className="text-[14px] font-bold text-text">{e.name}</h3>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-green/80">
                {e.state}
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{e.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="hero-aurora border-b border-line">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-extrabold tracking-[-0.01em] text-text sm:text-4xl">
          See the signal before it becomes obvious.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-muted">
          RECODE gives you the tools to discover, scan and decode tokenized markets.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            className="rounded-[4px] btn-accent px-7 py-3 text-[13px] font-semibold text-green transition-colors"
          >
            RECODE App
          </Link>
        </div>
      </div>
    </section>
  );
}
