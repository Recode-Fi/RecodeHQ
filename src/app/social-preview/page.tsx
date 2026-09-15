import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RECODE — X Thread Preview (Solana Integration)",
  description:
    "Internal review page: the 8 official RECODE X/Twitter banners for the Solana integration thread at 1600×900.",
};

const BANNERS = [
  { file: "/social/recode-x-thread/recode-x-thread-01-hook.png", label: "Tweet 1 — The Hook", text: "Markets move on-chain before the story reaches you." },
  { file: "/social/recode-x-thread/recode-x-thread-02-intelligence.png", label: "Tweet 2 — What RECODE Is", text: "Raw activity → structured intelligence." },
  { file: "/social/recode-x-thread/recode-x-thread-03-solana.png", label: "Tweet 3 — Solana", text: "SOLANA. FIRST-CLASS." },
  { file: "/social/recode-x-thread/recode-x-thread-04-scanner.png", label: "Tweet 4 — Solana Market Scanner", text: "SOLANA MARKET SCANNER — Real data. Or nothing." },
  { file: "/social/recode-x-thread/recode-x-thread-05-wallet.png", label: "Tweet 5 — Wallet Intelligence", text: "An address is not just a balance." },
  { file: "/social/recode-x-thread/recode-x-thread-06-whales-smartmoney.png", label: "Tweet 6 — Whales + Smart Money", text: "Size vs. behavior." },
  { file: "/social/recode-x-thread/recode-x-thread-07-radar-ai.png", label: "Tweet 7 — Radar + AI", text: "Signals surface. AI decodes." },
  { file: "/social/recode-x-thread/recode-x-thread-08-vision.png", label: "Tweet 8 — The Vision", text: "Decode what moves the market." },
];

export default function SocialPreviewPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[22px] font-extrabold tracking-[0.2em] text-text">RECODE — X THREAD CAMPAIGN</h1>
        <p className="mt-2 text-[13px] text-muted">
          Official Solana-integration thread visuals · 1600×900 PNG · review before posting
        </p>
      </header>
      <div className="flex flex-col gap-10">
        {BANNERS.map((b, i) => (
          <section key={b.file}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12px] font-bold tracking-[0.28em] text-muted">{b.label.toUpperCase()}</span>
              <span className="text-[11px] text-faint">{b.text}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.file}
              alt={`${b.label} — RECODE X thread banner ${i + 1} of 8`}
              width={1600}
              height={900}
              className="w-full rounded-[6px] border border-line"
              loading="lazy"
            />
          </section>
        ))}
      </div>
    </main>
  );
}
