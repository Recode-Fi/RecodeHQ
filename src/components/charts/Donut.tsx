"use client";

const PALETTE = ["var(--chart-up)", "var(--color-line-strong)", "var(--color-faint)", "var(--color-line)", "var(--color-muted)", "var(--color-panel-2)", "var(--color-warn)"];

export function Donut({
  slices,
  size = 170,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; pct: number; color?: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const clean = slices.filter((s) => s.pct > 0);
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
        <circle cx="80" cy="80" r={R} fill="none" style={{ stroke: "var(--color-panel-2)" }} strokeWidth="16" />
        {clean.map((s, i) => {
          const len = (s.pct / 100) * C;
          const el = (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              style={{ stroke: s.color ?? PALETTE[i % PALETTE.length] }}
              strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += len;
          return el;
        })}
        {centerValue ? (
          <text x="80" y="78" textAnchor="middle" style={{ fill: "var(--color-text)" }} fontSize="13" fontWeight="600" className="tnum">
            {centerValue}
          </text>
        ) : null}
        {centerLabel ? (
          <text x="80" y="94" textAnchor="middle" style={{ fill: "var(--color-muted)" }} fontSize="9" letterSpacing="1">
            {centerLabel}
          </text>
        ) : null}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {clean.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate text-muted">{s.label}</span>
            </span>
            <span className="tnum text-text">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
