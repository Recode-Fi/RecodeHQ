import Link from "next/link";

const CAPABILITIES = [
  { key: "SEE", desc: "Discover markets, assets and activity.", href: "/app/radar" },
  { key: "SCAN", desc: "Analyze wallets, contracts and assets.", href: "/app/scanner" },
  { key: "DECODE", desc: "Turn raw blockchain activity into useful intelligence.", href: "/app" },
];

const PRODUCTS = [
  { name: "Radar", tag: "See the market.", desc: "Explore market-wide activity, asset movements and emerging trends.", href: "/app/radar" },
  { name: "Discover", tag: "Find what matters.", desc: "Browse the tokenized universe and RWA opportunities using real verified data.", href: "/app/discover" },
  { name: "Scan", tag: "Look deeper.", desc: "Analyze wallets, contracts, assets and on-chain activity.", href: "/app/scanner" },
  { name: "Asset Intelligence", tag: "Understand the signal.", desc: "Transform market activity into structured intelligence.", href: "/app/assets" },
  { name: "Signals", tag: "Detect movement early.", desc: "Identify unusual activity, whale movements, accumulation and distribution.", href: "/app/signals" },
  { name: "Forecast", tag: "Look ahead.", desc: "Forward-looking analytics based on observable market signals.", href: "/app/forecast" },
];

export function WhatIsSection() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl font-bold tracking-[-0.01em] text-text">
          The intelligence layer for tokenized markets.
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
          RECODE transforms complex on-chain and tokenized-asset data into understandable market
          intelligence - so you can move from raw blockchain noise to a clear read on what is
          actually happening.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <Link
              key={c.key}
              href={c.href}
              className="landing-card fade-up rounded-[6px] border border-line bg-panel p-5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="text-[12px] font-extrabold tracking-[0.2em] text-green">{c.key}</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductsSection() {
  return (
    <section id="products" className="border-b border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-[-0.01em] text-text">Core products</h2>
        <p className="mt-3 max-w-2xl text-[14px] text-muted">
          Six focused modules, one intelligence pipeline.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <Link
              key={p.name}
              href={p.href}
              className="landing-card fade-up group rounded-[6px] border border-line bg-panel p-6"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <h3 className="text-[17px] font-bold text-text">{p.name}</h3>
              <p className="mt-1 text-[12.5px] font-medium text-green">{p.tag}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{p.desc}</p>
              <span className="mt-4 inline-block text-[11.5px] font-semibold text-faint transition-colors group-hover:text-green">
                Open module →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const ASSET_CLASSES = [
  { mono: "STK", label: "Tokenized stocks" },
  { mono: "ETF", label: "Tokenized ETFs" },
  { mono: "TSY", label: "Treasuries" },
  { mono: "CMD", label: "Commodities" },
  { mono: "RE", label: "Real estate" },
  { mono: "CR", label: "Credit" },
  { mono: "$", label: "Stablecoins" },
  { mono: "RWA", label: "Other tokenized assets" },
];

export function RwaSection() {
  return (
    <section id="rwa" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.01em] text-text">
              The market is becoming programmable.
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">
              Real-world assets are moving on-chain. RECODE is designed to help you understand
              tokenized stocks, ETFs, treasuries, commodities, real estate, credit, stablecoins
              and other tokenized assets - with verified data and honest states when data is
              unavailable. We never fabricate market numbers.
            </p>
            <Link
              href="/app/markets"
              className="mt-6 inline-block rounded-[4px] btn-accent px-5 py-2.5 text-[12.5px] font-semibold text-green transition-colors"
            >
              Explore tokenized assets
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ASSET_CLASSES.map((a, i) => (
              <div
                key={a.label}
                className="fade-up flex aspect-square flex-col items-center justify-center gap-2 rounded-[6px] border border-line bg-panel"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="tnum flex h-10 w-10 items-center justify-center rounded-[4px] border border-line bg-panel-2 text-[11px] font-bold text-muted">
                  {a.mono}
                </span>
                <span className="px-2 text-center text-[10px] leading-tight text-faint">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

