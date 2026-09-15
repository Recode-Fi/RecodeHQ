import Link from "next/link";
import { RecodeMark } from "@/components/brand/Logo";

/**
 * Conceptual intelligence-network visual. Pure SVG + CSS (no JS animation),
 * no financial values - the animation represents the pipeline, not prices.
 */
export function SignalNetwork() {
  const nodes: { x: number; y: number; r: number; tone: string; label: string; pulse?: boolean }[] = [
    { x: 260, y: 190, r: 7, tone: "var(--color-accent)", label: "RECODE ENGINE", pulse: true },
    { x: 90, y: 70, r: 4, tone: "var(--color-muted)", label: "assets" },
    { x: 420, y: 60, r: 4, tone: "var(--color-muted)", label: "wallets" },
    { x: 60, y: 300, r: 4, tone: "var(--color-muted)", label: "liquidity" },
    { x: 440, y: 310, r: 4, tone: "var(--color-muted)", label: "transfers" },
    { x: 150, y: 190, r: 3.5, tone: "var(--color-faint)", label: "" },
    { x: 370, y: 190, r: 3.5, tone: "var(--color-faint)", label: "" },
    { x: 260, y: 70, r: 4, tone: "var(--color-accent)", label: "signals", pulse: true },
    { x: 260, y: 315, r: 4, tone: "var(--color-accent)", label: "signals", pulse: true },
  ];
  const links: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [1, 5], [2, 6], [3, 5], [4, 6], [7, 1], [7, 2], [8, 3], [8, 4],
  ];
  return (
    <div className="fade-up relative" style={{ animationDelay: "200ms" }}>
      <svg viewBox="0 0 520 380" className="w-full" role="img" aria-label="Conceptual RECODE intelligence network">
        {links.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            style={{ stroke: nodes[a].tone === "var(--color-accent)" || nodes[b].tone === "var(--color-accent)" ? "var(--network-line-active)" : "var(--network-line)" }}
            strokeWidth="1"
            className="flow-line"
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            {n.pulse ? <circle cx={n.x} cy={n.y} r={n.r + 8} style={{ fill: n.tone }} opacity="0.08" /> : null}
            <circle cx={n.x} cy={n.y} r={n.r} style={{ fill: n.tone }} className={n.pulse ? "pulse-node" : ""} opacity={n.pulse ? 1 : 0.8} />
            {n.label ? (
              <text x={n.x} y={n.y - n.r - 8} textAnchor="middle" style={{ fill: n.tone === "var(--color-accent)" ? "var(--color-green)" : "var(--color-faint)", textTransform: "uppercase" }} fontSize="9" letterSpacing="1.5">
                {n.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="hero-aurora border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 lg:grid-cols-2 lg:pb-24 lg:pt-20">
        <div>
          <div className="fade-up mb-5 inline-flex items-center gap-2 rounded-[4px] border border-green/25 bg-green-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-green">
            <span className="live-dot" /> RWA &amp; On-chain Intelligence
          </div>
          <div className="fade-up mb-3 flex items-center gap-2.5" style={{ animationDelay: "60ms" }}>
            <RecodeMark size={30} />
            <span className="text-[20px] font-extrabold tracking-[0.24em] text-text">RECODE</span>
          </div>
          <h1
            className="fade-up text-4xl font-extrabold leading-[1.06] tracking-[-0.02em] text-text sm:text-[52px]"
            style={{ animationDelay: "120ms" }}
          >
            Decode what moves markets.
          </h1>
          <p className="fade-up mt-5 max-w-xl text-[15px] leading-relaxed text-muted" style={{ animationDelay: "180ms" }}>
            Real-time intelligence for tokenized assets, RWA markets and on-chain activity.
          </p>
          <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link
              href="/app"
              className="rounded-[4px] border border-green/40 bg-green-soft px-6 py-3 text-[13px] font-semibold text-green transition-colors"
            >
              RECODE App
            </Link>
            <Link
              href="/app/markets"
              className="rounded-[4px] border border-line bg-panel px-6 py-3 text-[13px] font-semibold text-text transition-colors hover:border-line-strong"
            >
              Explore Markets
            </Link>
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-faint">
            Independent intelligence platform. Not affiliated with Robinhood Markets, Inc.
          </p>
        </div>
        <SignalNetwork />
      </div>
    </section>
  );
}

export function PipelineStrip() {
  const steps = ["RAW DATA", "RECODE ENGINE", "INTELLIGENCE", "SIGNALS", "ACTION"];
  return (
    <section className="border-b border-line bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-6 py-5">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-3">
            <span
              className={`text-[10.5px] font-semibold uppercase tracking-[0.16em] ${
                i === 1 ? "text-green" : "text-muted"
              }`}
            >
              {s}
            </span>
            {i < steps.length - 1 ? <span className="text-faint">→</span> : null}
          </span>
        ))}
      </div>
    </section>
  );
}
