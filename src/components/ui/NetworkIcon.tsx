"use client";

import { getNetwork } from "@/chains/registry";

/**
 * ============================================================
 * NETWORK ICON — centralized chain-logo rendering.
 * The network registry (src/chains/registry.ts) is the single
 * source of truth: every surface renders the official brand SVG
 * declared on the NetworkConfig entry. No per-component logos.
 * Falls back to a neutral dot when a network has no icon.
 * ============================================================
 */
export function NetworkIcon({
  id,
  size = 16,
  className = "",
}: {
  /** Network id from the registry (e.g. "robinhood-chain", "solana"). */
  id: string;
  size?: number;
  className?: string;
}) {
  const icon = getNetwork(id)?.icon;
  if (icon) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center [&_svg]:h-full [&_svg]:w-full ${className}`}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent ${className}`}
      style={{ width: Math.max(6, size * 0.4), height: Math.max(6, size * 0.4) }}
      aria-hidden
    />
  );
}