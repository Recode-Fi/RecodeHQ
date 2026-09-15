import { useCallback, useEffect, useState } from "react";
import {
  recodeTokenService,
  type TokenEnvelope,
  type TokenStatus,
} from "@/services/recodeTokenService";
import { RECODE_CONFIG } from "@/lib/recodeConfig";

/** UI-facing state derived from the token envelope (never faked "live"). */
export type TokenUiState = "connecting" | "live" | "delayed" | "unavailable" | "unconfigured";

/**
 * Visibility-aware token snapshot poller (sensible 30s interval — a single
 * lightweight endpoint, paused while the tab is hidden).
 *
 * Initial state is derived from the central token configuration: when the
 * token is not launched/configured the surface renders its honest
 * "unconfigured" state immediately — even on the server — so the TBA
 * contract row appears without a client-side flash.
 */
export function useTokenSnapshot(intervalMs = 30_000): {
  envelope: TokenEnvelope;
  ui: TokenUiState;
  reload: () => void;
} {
  const preUnconfigured = !RECODE_CONFIG.launched;
  const [envelope, setEnvelope] = useState<TokenEnvelope>(
    preUnconfigured
      ? { status: "unconfigured", data: null, message: "Token contract not yet configured" }
      : { status: "unavailable", data: null },
  );
  const [ui, setUi] = useState<TokenUiState>(preUnconfigured ? "unconfigured" : "connecting");

  const load = useCallback(async () => {
    const res = await recodeTokenService.snapshot();
    setEnvelope(res);
    setUi(mapStatus(res.status));
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, intervalMs]);

  return { envelope, ui, reload: load };
}

function mapStatus(status: TokenStatus): TokenUiState {
  switch (status) {
    case "live":
      return "live";
    case "stale":
      return "delayed";
    case "unconfigured":
      return "unconfigured";
    default:
      return "unavailable";
  }
}
