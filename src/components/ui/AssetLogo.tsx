"use client";

/**
 * Asset logo — provider-resolved CDN logo when reachable; otherwise a
 * neutral ticker monogram in the panel palette. Never fabricates imagery.
 */
export function AssetLogo({
  symbol,
  url,
  size = 26,
}: {
  symbol: string | null | undefined;
  url?: string | null;
  size?: number;
}) {
  const sym = (symbol ?? "?").slice(0, 4).toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={sym}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-[4px] border border-line-soft bg-panel-2 object-contain"
        style={{ width: size, height: size }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <span
      className="tnum flex shrink-0 items-center justify-center rounded-[4px] border border-line bg-panel-2 text-[9px] font-bold text-muted"
      style={{ width: size, height: size }}
    >
      {sym}
    </span>
  );
}
