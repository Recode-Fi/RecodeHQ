/**
 * ============================================================
 * RECODE — Asset Intelligence scoring (pure, deterministic)
 * ============================================================
 * Every score is DERIVED from verified market data only. When an
 * input is missing the score is null — never a guess. Same inputs
 * always produce the same outputs (no randomness, no clock reads:
 * candles + quote are passed in by the caller).
 *
 * Formulas (thresholds configurable via env, see .env.example):
 *
 *  momentum = 50 + 50*tanh( Σ(wi * ri)/Σ(wi) + volAccelAdj )
 *      ri = log return over 1h / 24h / 7d windows (available ones only,
 *           weights renormalized); volAccelAdj = clamp((rvol-1)*0.15, ±0.25)
 *      where rvol = verified 24h volume ÷ average daily candle volume.
 *      Score 0..100, 50 = flat.
 *
 *  volumeActivity: rvol = verified 24h volume ÷ average daily candle volume.
 *      rvol ≥ HIGH → "HIGH", ≥ ELEVATED → "ELEVATED", ≥ NORMAL → "NORMAL",
 *      else "LOW". Needs ≥3 daily volume observations.
 *
 *  liquidity = 100 * mean( volumeScore, spreadScore )
 *      volumeScore = min(1, volume24h / LIQ_VOL_REF)
 *      spreadScore = 1 if spread ≤ TIGHT, 0 if ≥ WIDE, linear between
 *      label: ≥66 "HIGH" · ≥33 "MEDIUM" · else "LOW"
 *
 *  volatility = stddev of per-candle log returns, annualized
 *      (periods/year by timeframe) × 100 → LOW/MEDIUM/HIGH.
 *
 *  trend = 100 * tanh( (SMA(fast)/SMA(slow) - 1) / 0.03 )
 *      over available verified closes; >25 BULLISH, <-25 BEARISH, else NEUTRAL.
 */

import type { CandleTimeframe } from "@/server/sync/types";

/** Local mirror of the engine timeframe union (keeps this module import-free of server code). */
export type IntelTimeframe = CandleTimeframe;

export interface IntelCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface IntelligenceInput {
  candles?: IntelCandle[] | null;
  candleTimeframe?: CandleTimeframe;
  price?: number | null;
  volume24h?: number | null;
  spreadPct?: number | null;
  change24hPct?: number | null;
}

export interface Scored<T> {
  /** Numeric score where applicable (momentum 0–100, liquidity 0–100). */
  score?: number;
  /** Categorical label (e.g. HIGH/MEDIUM/LOW, BULLISH/BEARISH/NEUTRAL). */
  label?: T;
  /** How the value was derived — surfaced in the UI for transparency. */
  basis: string;
}

export interface IntelligenceResult {
  momentum: Scored<number> | null;
  volumeActivity: {
    rvol: number;
    label: "HIGH" | "ELEVATED" | "NORMAL" | "LOW";
    basis: string;
  } | null;
  liquidity: Scored<"HIGH" | "MEDIUM" | "LOW"> | null;
  volatility: Scored<"LOW" | "MEDIUM" | "HIGH"> | null;
  trend: Scored<"BULLISH" | "BEARISH" | "NEUTRAL"> | null;
  /** 0..1 share of the five metrics that actually had data. */
  dataConfidence: number;
  /** Every metric that could not be computed, with the reason. */
  unavailable: string[];
}

export interface IntelligenceThresholds {
  momentumWeights: [number, number, number]; // r1h, r24h, r7d
  volume: { high: number; elevated: number; normal: number };
  liquidity: { volRef: number; spreadTight: number; spreadWide: number };
  volatility: { minCandles: number; lowPct: number; highPct: number };
  trend: { minCandles: number; bullPct: number; bearPct: number };
}

export const DEFAULT_THRESHOLDS: IntelligenceThresholds = {
  momentumWeights: [0.2, 0.45, 0.35],
  volume: { high: 2, elevated: 1.25, normal: 0.6 },
  liquidity: { volRef: 5_000_000, spreadTight: 0.15, spreadWide: 1.5 },
  volatility: { minCandles: 12, lowPct: 20, highPct: 60 },
  trend: { minCandles: 12, bullPct: 25, bearPct: -25 },
};

const PERIODS_PER_YEAR: Record<string, number> = {
  "1m": 350 * 1440,
  "5m": 350 * 288,
  "15m": 350 * 96,
  "30m": 350 * 48,
  "1h": 350 * 24,
  "4h": 350 * 6,
  "1d": 365,
  "1w": 52,
};

function sma(values: number[], n: number): number | null {
  if (values.length < n || n <= 0) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function logReturn(closes: number[], periods: number): number | null {
  if (periods <= 0 || closes.length <= periods) return null;
  const start = closes[closes.length - 1 - periods];
  const end = closes[closes.length - 1];
  if (start <= 0 || end <= 0) return null;
  return Math.log(end / start);
}

/** Groups per-timeframe bucket volumes into pseudo-daily sums (24 buckets/day). */
function dailyVolumes(buckets: number[], perDay: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < buckets.length; i += perDay) {
    out.push(buckets.slice(i, i + perDay).reduce((a, b) => a + b, 0));
  }
  return out;
}

/** Configurable thresholds (env-overridable server-side; see .env.example). */
export function thresholdsFromEnv(): IntelligenceThresholds {
  const list = (name: string, fallback: number[]): number[] | null => {
    const raw = process.env[name];
    if (!raw || !raw.trim()) return null;
    const parsed = raw.split(",").map((s) => Number(s.trim()));
    if (parsed.length !== fallback.length || parsed.some((n) => !Number.isFinite(n) || n < 0)) {
      return null;
    }
    return parsed;
  };
  const m = list("RECODE_MOMENTUM_WEIGHTS", DEFAULT_THRESHOLDS.momentumWeights);
  const l = list("RECODE_LIQUIDITY_THRESHOLDS", [
    DEFAULT_THRESHOLDS.liquidity.volRef,
    DEFAULT_THRESHOLDS.liquidity.spreadTight,
    DEFAULT_THRESHOLDS.liquidity.spreadWide,
  ]);
  const v = list("RECODE_VOLATILITY_THRESHOLDS", [
    DEFAULT_THRESHOLDS.volatility.minCandles,
    DEFAULT_THRESHOLDS.volatility.lowPct,
    DEFAULT_THRESHOLDS.volatility.highPct,
  ]);
  return {
    momentumWeights: (m as [number, number, number]) ?? DEFAULT_THRESHOLDS.momentumWeights,
    volume: { ...DEFAULT_THRESHOLDS.volume },
    liquidity: l
      ? { volRef: l[0], spreadTight: l[1], spreadWide: l[2] }
      : { ...DEFAULT_THRESHOLDS.liquidity },
    volatility: v
      ? { minCandles: v[0], lowPct: v[1], highPct: v[2] }
      : { ...DEFAULT_THRESHOLDS.volatility },
    trend: { ...DEFAULT_THRESHOLDS.trend },
  };
}

function bucketVols(candles: IntelCandle[] | null | undefined): number[] {
  return (candles ?? []).filter((c) => c.v != null && c.v > 0).map((c) => c.v as number);
}

/** Buckets-per-day for pseudo-daily volume aggregation, by candle timeframe. */
function bucketsPerDay(tf: CandleTimeframe | undefined): number {
  if (tf === "1d") return 1;
  if (tf === "4h") return 6;
  return 24;
}

/** Volume-acceleration adjustment from verified volume, clamped to ±0.25. */
function volumeAcceleration(
  candles: IntelCandle[] | null | undefined,
  volume24h: number | null,
  tf: CandleTimeframe | undefined,
): number {
  if (volume24h == null || volume24h <= 0) return 0;
  const perDay = bucketsPerDay(tf);
  const daily = dailyVolumes(bucketVols(candles), perDay);
  if (daily.length < 2) return 0;
  const avgDaily = daily.reduce((a, b) => a + b, 0) / daily.length;
  if (avgDaily <= 0) return 0;
  return Math.max(-0.25, Math.min(0.25, (volume24h / avgDaily - 1) * 0.15));
}

export function computeIntelligence(
  input: IntelligenceInput,
  thresholds: IntelligenceThresholds = DEFAULT_THRESHOLDS,
): IntelligenceResult {
  const closes = (input.candles ?? [])
    .map((c) => c.c)
    .filter((c) => Number.isFinite(c) && c > 0);
  const unavailable: string[] = [];

  /* ---------- Momentum ---------- */
  let momentum: Scored<number> | null = null;
  {
    const [w1, w2, w3] = thresholds.momentumWeights;
    const parts: { w: number; r: number; label: string }[] = [];
    const r1h = logReturn(closes, 1);
    const r24h =
      input.change24hPct != null && input.change24hPct > -100
        ? Math.log(1 + input.change24hPct / 100)
        : logReturn(closes, 24);
    const r7d = closes.length > 24 ? logReturn(closes, Math.min(168, closes.length - 1)) : null;
    if (r1h != null) parts.push({ w: w1, r: r1h, label: "1h" });
    if (r24h != null) parts.push({ w: w2, r: r24h, label: "24h" });
    if (r7d != null) parts.push({ w: w3, r: r7d, label: "7d" });
    if (parts.length > 0) {
      const wsum = parts.reduce((a, p) => a + p.w, 0);
      const blended = parts.reduce((a, p) => a + (p.r * p.w) / wsum, 0);
      const volAccelAdj = volumeAcceleration(
        input.candles,
        input.volume24h ?? null,
        input.candleTimeframe,
      );
      momentum = {
        score: Math.round(Math.max(0, Math.min(100, 50 + 50 * Math.tanh(blended + volAccelAdj)))),
        basis: `Weighted log returns (${parts.map((p) => p.label).join(", ")})${
          volAccelAdj !== 0 ? " + volume acceleration" : ""
        }`,
      };
    } else {
      unavailable.push("Momentum — insufficient verified price history");
    }
  }

  /* ---------- Volume activity (relative volume) ---------- */
  let volumeActivity: IntelligenceResult["volumeActivity"] = null;
  if (input.volume24h != null && input.volume24h > 0) {
    const perDay = bucketsPerDay(input.candleTimeframe);
    const daily = dailyVolumes(bucketVols(input.candles), perDay);
    if (daily.length >= 2) {
      const avgDaily = daily.reduce((a, b) => a + b, 0) / daily.length;
      const rvol = input.volume24h / avgDaily;
      const label =
        rvol >= thresholds.volume.high
          ? "HIGH"
          : rvol >= thresholds.volume.elevated
            ? "ELEVATED"
            : rvol >= thresholds.volume.normal
              ? "NORMAL"
              : "LOW";
      volumeActivity = {
        rvol: Math.round(rvol * 100) / 100,
        label,
        basis: `Verified 24h volume ÷ ${daily.length}-day average candle volume`,
      };
    } else {
      unavailable.push("Volume activity — no verified candle volume history yet");
    }
  } else {
    unavailable.push("Volume activity — no verified 24h volume");
  }

  /* ---------- Liquidity ---------- */
  let liquidity: Scored<"HIGH" | "MEDIUM" | "LOW"> | null = null;
  {
    const t = thresholds.liquidity;
    const vol24 = input.volume24h;
    const spread = input.spreadPct;
    const volScore = vol24 != null && vol24 > 0 ? Math.min(1, vol24 / t.volRef) : null;
    const spreadScore =
      spread == null
        ? null
        : spread <= t.spreadTight
          ? 1
          : spread >= t.spreadWide
            ? 0
            : 1 - (spread - t.spreadTight) / (t.spreadWide - t.spreadTight);
    if (volScore == null && spreadScore == null) {
      unavailable.push("Liquidity — neither verified volume nor bid/ask spread available");
    } else {
      const present = [volScore, spreadScore].filter((v): v is number => v != null);
      const score = Math.round((present.reduce((a, v) => a + v, 0) / present.length) * 100);
      liquidity = {
        score,
        label: score >= 66 ? "HIGH" : score >= 33 ? "MEDIUM" : "LOW",
        basis: [
          volScore != null ? "24h volume vs reference" : null,
          spreadScore != null ? "bid/ask spread" : null,
        ]
          .filter(Boolean)
          .join(" + "),
      };
    }
  }

  /* ---------- Volatility ---------- */
  let volatility: Scored<"LOW" | "MEDIUM" | "HIGH"> | null = null;
  if (closes.length >= thresholds.volatility.minCandles && input.candleTimeframe) {
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (rets.length >= thresholds.volatility.minCandles - 1) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
      const ppy = PERIODS_PER_YEAR[input.candleTimeframe] ?? 365;
      const realizedPct = sd * Math.sqrt(ppy) * 100;
      volatility = {
        label:
          realizedPct < thresholds.volatility.lowPct
            ? "LOW"
            : realizedPct < thresholds.volatility.highPct
              ? "MEDIUM"
              : "HIGH",
        basis: `${rets.length}-period realized volatility, annualized (${input.candleTimeframe} closes)`,
      };
    } else {
      unavailable.push("Volatility — needs more verified candles");
    }
  } else {
    unavailable.push("Volatility — needs more verified candles");
  }

  /* ---------- Trend ---------- */
  let trend: Scored<"BULLISH" | "BEARISH" | "NEUTRAL"> | null = null;
  if (closes.length >= thresholds.trend.minCandles) {
    const fastN = Math.max(2, Math.round(closes.length / 4));
    const slowN = Math.max(fastN + 1, Math.round(closes.length / 1.5));
    const fast = sma(closes, fastN);
    const slow = sma(closes, slowN);
    if (fast != null && slow != null && slow > 0) {
      const raw = Math.round(100 * Math.tanh((fast / slow - 1) / 0.03));
      trend = {
        label:
          raw > thresholds.trend.bullPct
            ? "BULLISH"
            : raw < thresholds.trend.bearPct
              ? "BEARISH"
              : "NEUTRAL",
        basis: `SMA(${fastN}) vs SMA(${slowN}) over ${closes.length} verified closes`,
      };
    } else {
      unavailable.push("Trend — needs more verified closes");
    }
  } else {
    unavailable.push("Trend — needs more verified closes");
  }

  const produced =
    [momentum, liquidity, volatility, trend].filter(Boolean).length +
    (volumeActivity?.label != null ? 1 : 0);

  return {
    momentum,
    volumeActivity,
    liquidity,
    volatility,
    trend,
    dataConfidence: Math.round((produced / 5) * 100) / 100,
    unavailable,
  };
}