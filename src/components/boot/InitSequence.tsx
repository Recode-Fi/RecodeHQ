"use client";

/**
 * RECODE website initialization — "Code → Intelligence → RECODE".
 *
 * A once-per-session boot overlay (existing `recode.booted` session gate —
 * no replay on route/theme/wallet changes). The code lines are visual
 * initialization labels for the product's real modules; the ONLY status
 * claim is the sync-engine readiness poll, whose READY line renders solely
 * when the engine actually answers with its chain id. Always dark-styled
 * per brand (independent of the saved theme — the SSR-themed page beneath
 * never flashes) with the #CCFF00 neon accent used sparingly. Skippable
 * (click / Esc / button) and reduced to a brief static identity under
 * prefers-reduced-motion. Pure CSS animations + lightweight state — no
 * animation libraries.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RecodeMark } from "@/components/brand/Logo";

const CODE_LINES = [
  "> boot.recode()",
  "> market.intelligence.load()",
  "> tokenized.assets.index()",
  "> data.streams.connect()",
  "> signals.decode()",
  "> intelligence.compile()",
  "> recode.ready()",
];

/* Real startup check: the sync engine answers /api/sync/status with its
   chain id once the providers are wired. Abort quickly — the boot never
   waits on the engine; the READY line simply appears only on success. */
const STATUS_TIMEOUT_MS = 1500;

const TYPE_MS = 8; // per-character typing speed (fast, modern — not a hacker terminal)
const LINE_PAUSE_MS = 50;
const CODE_HOLD_MS = 250; // cursor lingers after the final line
const LOGO_ASSEMBLE_AT = 320; // fragments stream toward the center
const LOGO_FINISH_AT = 1400; // fade into the landing page
const EXIT_FADE_MS = 450;
const REDUCED_HOLD_MS = 900;

const LETTERS = "RECODE".split("");

/* Minimal drifting code fragments — a subtle data-stream texture, never
   Matrix-style. Each carries its center-assembly vector for the finale. */
const FRAGMENTS: { t: string; x: string; y: string; d: number; asm: [string, string] }[] = [
  { t: "0x", x: "10%", y: "24%", d: 0, asm: ["40vw", "26vh"] },
  { t: "10", x: "82%", y: "18%", d: 500, asm: ["-32vw", "32vh"] },
  { t: "{}", x: "16%", y: "72%", d: 900, asm: ["34vw", "-22vh"] },
  { t: "<>", x: "80%", y: "70%", d: 300, asm: ["-30vw", "-20vh"] },
  { t: "[]", x: "30%", y: "9%", d: 700, asm: ["20vw", "41vh"] },
  { t: "::", x: "68%", y: "8%", d: 1100, asm: ["-18vw", "42vh"] },
  { t: "01", x: "6%", y: "48%", d: 200, asm: ["44vw", "2vh"] },
  { t: ">>", x: "92%", y: "44%", d: 800, asm: ["-42vw", "6vh"] },
  { t: "/", x: "40%", y: "84%", d: 600, asm: ["10vw", "-34vh"] },
  { t: "0x1F", x: "58%", y: "88%", d: 1000, asm: ["-8vw", "-38vh"] },
];

type Stage = "code" | "logo";

export function InitSequence() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [stage, setStage] = useState<Stage>("code");
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [assembling, setAssembling] = useState(false);
  /* Real readiness: true ONLY when the engine answers with its chain id.
     null = not answered yet (line withheld); false = failed (line withheld). */
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      sessionStorage.setItem("recode.booted", "1");
    } catch {
      /* private mode — the overlay still fades; it simply may replay next session */
    }
    setExiting(true);
    window.setTimeout(() => setVisible(false), EXIT_FADE_MS);
  }, []);

  /* Session gate (no replay on internal navigation) + reduced-motion detect. */
  useEffect(() => {
    try {
      if (sessionStorage.getItem("recode.booted") === "1") {
        setVisible(false);
        return;
      }
    } catch {
      /* private mode — show once */
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  /* Reduced motion: no typewriter — brief static identity, straight in. */
  useEffect(() => {
    if (!reduced || !visible) return;
    const t = window.setTimeout(finish, REDUCED_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [reduced, visible, finish]);

  /* Real startup check — single, quick, non-blocking, honest. */
  useEffect(() => {
    if (!visible || reduced) return;
    fetch("/api/sync/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { chainId?: number } | null) => {
        if (j && j.chainId) setEngineReady(true);
      })
      .catch(() => setEngineReady(false));
  }, [visible, reduced]);

  /* Typewriter driver — one timer per character, like a real system. */
  useEffect(() => {
    if (reduced || stage !== "code") return;
    const line = CODE_LINES[lineIdx];
    if (charIdx < line.length) {
      const t = window.setTimeout(() => setCharIdx((c) => c + 1), TYPE_MS);
      return () => window.clearTimeout(t);
    }
    if (lineIdx < CODE_LINES.length - 1) {
      const t = window.setTimeout(() => {
        setLineIdx((l) => l + 1);
        setCharIdx(0);
      }, LINE_PAUSE_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStage("logo"), CODE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [reduced, stage, lineIdx, charIdx]);

  /* Logo stage: fragments assemble → RECODE compiles → tagline → fade out. */
  useEffect(() => {
    if (stage !== "logo" || reduced) return;
    const t1 = window.setTimeout(() => setAssembling(true), LOGO_ASSEMBLE_AT);
    const t2 = window.setTimeout(finish, LOGO_FINISH_AT);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [stage, reduced, finish]);

  /* Skip: Esc, backdrop click, or the skip button. */
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, finish]);

  if (!visible) return null;

  const currentLine = CODE_LINES[lineIdx];

  return (
    <div
      className={`boot-backdrop fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden ${
        exiting ? "boot-exit" : ""
      }`}
      role="status"
      aria-label="RECODE initializing"
      onClick={() => finish()}
    >
      {/* Drifting code fragments — they stream toward the center at the finale. */}
      {FRAGMENTS.map((f, i) => (
        <span
          key={`${f.t}-${i}`}
          aria-hidden
          className={`boot-frag absolute font-mono ${i > 5 ? "hidden sm:block" : ""} ${
            assembling ? "boot-frag-assembling" : ""
          }`}
          style={
            {
              left: f.x,
              top: f.y,
              animationDelay: assembling ? "0ms" : `${f.d}ms`,
              color: i % 3 === 0 ? "#CCFF00" : "rgba(245, 247, 245, 0.3)",
              fontSize: i % 2 === 0 ? "12px" : "10px",
              ...(assembling ? { "--asm-x": f.asm[0], "--asm-y": f.asm[1] } : {}),
            } as React.CSSProperties
          }
        >
          {f.t}
        </span>
      ))}

      {reduced ? (
        /* Reduced motion: complete identity, brief hold, straight into the site. */
        <div className="flex flex-col items-center px-6 text-center">
          <RecodeMark size={44} />
          <div className="mt-4 text-[24px] font-extrabold tracking-[0.28em] text-white">RECODE</div>
          <p className="mt-1 text-[12px] text-[#858D87]">Decode what moves markets.</p>
        </div>
      ) : stage === "code" ? (
        /* Stages 01-06: the system writing itself into existence. */
        <div className="w-full max-w-[360px] px-6 font-mono">
          <div className="mb-4 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.32em] text-[#5A625C]">
            <span className="h-1.5 w-1.5" style={{ background: "#CCFF00" }} />
            RECODE SYSTEM
          </div>
          {CODE_LINES.slice(0, lineIdx).map((line) => (
            <div
              key={line}
              className="whitespace-pre py-0.5 text-[10.5px] leading-relaxed text-[#5A625C] sm:text-[11.5px]"
            >
              {line}
            </div>
          ))}
          <div className="whitespace-pre py-0.5 text-[10.5px] leading-relaxed text-[#F5F7F5] sm:text-[11.5px]">
            {currentLine.slice(0, charIdx)}
            <span
              className="boot-cursor ml-0.5 inline-block h-[11px] w-[6px] translate-y-[1px]"
              style={{ background: "#CCFF00" }}
            />
          </div>
          {/* The single REAL status claim — rendered only when the engine
              actually answered with its chain id. Never simulated. */}
          {engineReady === true && lineIdx >= 4 ? (
            <div className="whitespace-pre py-0.5 text-[10.5px] leading-relaxed text-[#5A625C] sm:text-[11.5px]">
              {"> robinhood.chain.connected()"}
              <span style={{ color: "#CCFF00" }}> READY</span>
            </div>
          ) : null}
        </div>
      ) : (
        /* Final: the official keycap mark resolves into view, RECODE compiles letter-by-letter. */
        <div className="flex flex-col items-center px-6 text-center">
          <RecodeMarkDrawn />
          <div className="mt-4 flex justify-center overflow-hidden" aria-hidden>
            {LETTERS.map((l, i) => (
              <span
                key={`${l}-${i}`}
                className="boot-letter text-[26px] font-extrabold tracking-[0.28em] sm:text-[38px]"
                style={{
                  animationDelay: `${200 + i * 60}ms`,
                  color: i === LETTERS.length - 1 ? "#CCFF00" : "#F5F7F5",
                }}
              >
                {l}
              </span>
            ))}
          </div>
          <span className="sr-only">RECODE</span>
          <p
            className="boot-fade-up mt-1 text-[11.5px] text-[#858D87] sm:text-[13px]"
            style={{ animationDelay: "620ms" }}
          >
            Decode what moves markets.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute bottom-6 text-[9.5px] uppercase tracking-[0.24em] text-[#5A625C] transition-colors hover:text-[#858D87]"
      >
        Skip // Esc
      </button>
    </div>
  );
}

/** The official keycap mark resolves into view (pure CSS, no asset redraw). */
function RecodeMarkDrawn() {
  return (
    <img
      src="/recode-logo-mark.png"
      alt="RECODE"
      width={44}
      height={44}
      className="boot-mark-in rounded-[10px] border border-[#202521] object-cover"
      style={{ width: 44, height: 44 }}
      draggable={false}
    />
  );
}