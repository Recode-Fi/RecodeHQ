/**
 * $RECODE token client bridge — one source of truth shared by the
 * landing-page token card and the in-app token surface. Reads the
 * engine-backed /api/token route; returns only verified values or
 * explicit unavailable states.
 */

export interface RecodeTokenSnapshot {
  symbol: string;
  name: string;
  contract: string;
  chainId: number;
  price: number | null;
  change24hPct: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
  updatedAt: number;
  source: string;
}

export type TokenStatus = "live" | "stale" | "unconfigured" | "unavailable" | "error";

export interface TokenEnvelope {
  status: TokenStatus;
  data: RecodeTokenSnapshot | null;
  message?: string;
}

export const recodeTokenService = {
  async snapshot(): Promise<TokenEnvelope> {
    try {
      const res = await fetch("/api/token", { cache: "no-store" });
      if (!res.ok) {
        return { status: "unavailable", data: null, message: "Token data endpoint unreachable" };
      }
      return (await res.json()) as TokenEnvelope;
    } catch {
      return { status: "error", data: null, message: "Token data request failed" };
    }
  },
};
