import { useCallback, useEffect, useState } from "react";
import {
  recodeTokenService,
  type TokenEnvelope,
  type TokenStatus,
} from "@/services/recodeTokenService";

/** UI-facing state derived from the token envelope (never faked "live"). */
export type TokenUiState = "connecting" | "live" | "delayed" | "unavailable" | "unconfigured";

/**
 * Visibility-aware token snapshot poller (30s interval — one lightweight
 * endpoint, paused while the tab is hidden). SERVER-AUTHORITATIVE: the
 * configured/launched state comes from the API (which reads the central
 * env-driven token config), never from client-side env values. The UI
 * starts in "connecting" and renders the server's honest state.
 */
export function useTokenSnapshot(intervalMs = 30_000): {
  envelope: TokenEnvelope;
  ui: TokenUiState;
  reload: () => void;
} {
  const [envelope, setEnvelope] = useState<TokenEnvelope>({
    status: "unavailable",
    data: null,
    message: undefined,
  });
  const [ui, setUi] = useState<TokenUiState>("connecting");

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
