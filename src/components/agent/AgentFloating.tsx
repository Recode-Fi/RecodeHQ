"use client";

import { AgentButton } from "./AgentButton";
import { AgentPanel } from "./AgentPanel";

/**
 * RECODE Agent — single global mount point (button + panel).
 * Rendered once at the root layout; never per-page, never a
 * sidebar tab, never a navigation route.
 */
export function AgentFloating() {
  return (
    <>
      <AgentButton />
      <AgentPanel />
    </>
  );
}
