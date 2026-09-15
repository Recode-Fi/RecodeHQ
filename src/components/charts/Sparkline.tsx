"use client";

import { useMemo } from "react";

export function Sparkline({
  points,
  width = 88,
  height = 26,
  className = "",
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const step = width / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = i * step;
      const y = height - 2 - ((p - min) / range) * (height - 4);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M${coords.join("L")}`;
  }, [points, width, height]);

  if (!path) return <span className="text-[10px] text-faint">—</span>;
  const up = points[points.length - 1] >= points[0];
  const color = up ? "var(--chart-up)" : "var(--chart-down)";
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={path} fill="none" style={{ stroke: color }} strokeWidth="1.2" />
    </svg>
  );
}
