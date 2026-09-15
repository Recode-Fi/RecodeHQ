/**
 * RECODE brand mark — the official keycap logo asset
 * (public/recode-logo-mark.png, cropped from the original
 * public/recode-logo.png with pixels untouched — framing only).
 * Rounded corners echo the keycap's own silhouette; works standalone
 * as favicon / avatar / boot mark.
 */
export function RecodeMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/recode-logo-mark.png"
      alt="RECODE"
      width={size}
      height={size}
      className="shrink-0 rounded-[5px] border border-line object-cover"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function RecodeWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <RecodeMark size={22} />
      {!compact ? (
        <span className="text-[15px] font-extrabold tracking-[0.2em] text-text">RECODE</span>
      ) : null}
    </span>
  );
}
