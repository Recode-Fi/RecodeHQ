"use client";

import { useMemo, useState } from "react";

export interface SeriesPoint {
  t: number;
  c: number;
  /** Optional verified volume for the bucket (candle v) — used in volume mode. */
  v?: number | null;
}

export function PriceChart({
  points,
  height = 280,
  timeframe,
  mode = "price",
}: {
  points: SeriesPoint[];
  height?: number;
  timeframe: string;
  /** price (line) or volume (histogram from candle v) — defaults to price. */
  mode?: "price" | "volume";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = height;
  const padL = 8;
  const padR = 56;
  const padT = 12;
  const padB = 22;

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    // Volume mode: histogram over verified bucket volume (v). Buckets without
    // a verified volume are simply absent from the histogram — never faked.
    const vols = points.map((p) => p.v ?? null);
    const hasVolumes = vols.some((v) => v != null && v > 0);
    if (mode === "volume" && hasVolumes) {
      const vmax = Math.max(...vols.map((v) => (v != null && v > 0 ? v : 0)));
      if (vmax > 0) {
        const t0 = points[0].t;
        const t1 = points[points.length - 1].t;
        const tRange = t1 - t0 || 1;
        const x = (t: number) => padL + ((t - t0) / tRange) * (W - padL - padR);
        const slot = (W - padL - padR) / points.length;
        const bars = points
          .map((p, i) => {
            const v = vols[i];
            if (v == null || v <= 0) return null;
            const h = Math.max(2, (v / vmax) * (H - padT - padB));
            const prev = i > 0 ? vols[i - 1] : null;
            const rising = prev != null && v >= prev;
            return {
              key: `${p.t}`,
              x: x(p.t) - slot * 0.4,
              w: Math.max(1.5, slot * 0.8),
              y: H - padB - h,
              h,
              rising,
            };
          })
          .filter((b): b is NonNullable<typeof b> => b != null);
        const up = points[points.length - 1].c >= points[0].c;
        return { x, volume: { bars, vmax, slot }, up, t0, t1 };
      }
    }
    const min = Math.min(...points.map((p) => p.c));
    const max = Math.max(...points.map((p) => p.c));
    const range = max - min || max * 0.01 || 1;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const tRange = t1 - t0 || 1;
    const x = (t: number) => padL + ((t - t0) / tRange) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.c).toFixed(1)}`)
      .join("");
    const area = `${line}L${x(t1).toFixed(1)},${(H - padB).toFixed(1)}L${x(t0).toFixed(1)},${(H - padB).toFixed(1)}Z`;
    const up = points[points.length - 1].c >= points[0].c;
    return { x, y, line, area, min, max, range, up, t0, t1 };
  }, [points, H, mode]);

  if (!geom) {
    return (
      <div
        className="flex items-center justify-center rounded-[6px] border border-dashed border-line text-[12px] text-faint"
        style={{ height: Math.max(height, 160) }}
      >
        Awaiting market data — no verified price history for this timeframe yet
      </div>
    );
  }

  const color = geom.up ? "var(--chart-up)" : "var(--chart-down)";
  const gid = `pc-${geom.up ? "u" : "d"}-${Math.round(H)}-${mode}`;
  const hoverPoint = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < points.length; i++) {
            const d = Math.abs(geom.x(points[i].t) - px);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.16 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {geom.volume ? (
          <>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line
                key={f}
                x1={padL}
                x2={W - padR}
                y1={H - padB - f * (H - padT - padB)}
                y2={H - padB - f * (H - padT - padB)}
                style={{ stroke: "var(--color-line-soft)" }}
                strokeWidth="1"
              />
            ))}
            <text
              x={W - padR + 8}
              y={padT + 10}
              style={{ fill: "var(--color-faint)" }}
              fontSize="10"
              className="tnum"
            >
              {geom.volume.vmax >= 1e6
                ? `${(geom.volume.vmax / 1e6).toFixed(1)}M`
                : geom.volume.vmax >= 1e3
                  ? `${(geom.volume.vmax / 1e3).toFixed(1)}K`
                  : geom.volume.vmax.toFixed(0)}
            </text>
            {geom.volume.bars.map((b) => (
              <rect
                key={b.key}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                style={{ fill: b.rising ? "var(--chart-up)" : "var(--chart-down)" }}
                fillOpacity="0.55"
              />
            ))}
          </>
        ) : (
          <>
            {[geom.min, geom.min + geom.range / 2, geom.max].map((t) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={geom.y(t)}
                  y2={geom.y(t)}
                  style={{ stroke: "var(--color-line-soft)" }}
                  strokeWidth="1"
                />
                <text
                  x={W - padR + 8}
                  y={geom.y(t) + 3}
                  style={{ fill: "var(--color-faint)" }}
                  fontSize="10"
                  className="tnum"
                >
                  {t >= 1000 ? t.toLocaleString("en", { maximumFractionDigits: 0 }) : t.toFixed(t < 1 ? 4 : 2)}
                </text>
              </g>
            ))}
            <path d={geom.area} fill={`url(#${gid})`} />
            <path d={geom.line} fill="none" style={{ stroke: color }} strokeWidth="1.6" />
          </>
        )}
        {hoverPoint ? (
          <g>
            <line
              x1={geom.x(hoverPoint.t)}
              x2={geom.x(hoverPoint.t)}
              y1={padT}
              y2={H - padB}
              style={{ stroke: "var(--color-line-strong)" }}
              strokeDasharray="3 3"
            />
            {!geom.volume ? (
              <circle cx={geom.x(hoverPoint.t)} cy={geom.y(hoverPoint.c)} r="3" style={{ fill: color }} />
            ) : null}
          </g>
        ) : null}
      </svg>
      {hoverPoint ? (
        <div className="tnum pointer-events-none absolute right-14 top-2 rounded-[4px] border border-line bg-surface/95 px-2 py-1 text-[11px]">
          {geom.volume ? (
            <span className="text-muted">
              Vol {hoverPoint.v != null && hoverPoint.v > 0 ? hoverPoint.v.toLocaleString("en", { maximumFractionDigits: 0 }) : "—"}
            </span>
          ) : (
            <span className="text-muted">
              ${hoverPoint.c.toLocaleString("en", { maximumFractionDigits: 4 })}
            </span>
          )}
          <span className="ml-2 text-faint">{new Date(hoverPoint.t).toLocaleString("en", { hour12: false })}</span>
          <span className="ml-2 text-[10px] uppercase text-faint">{timeframe}</span>
        </div>
      ) : null}
    </div>
  );
}
