// Official brand SVGs (raw strings) from @web3icons/core - subpath default
// exports, typed as strings via the package's .svg.d.ts declarations.
import phantomIcon from "@web3icons/core/svgs/wallets/branded/phantom.svg";
import solflareIcon from "@web3icons/core/svgs/wallets/branded/solflare.svg";

/**
 * ============================================================
 * SOLANA WALLET REGISTRY — separate from the EVM wallet system.
 * Raw provider APIs only (window.phantom.solana / window.solflare):
 * no wallet SDKs, read-only (publicKey), no signing/sending —
 * the same trust model as the EVM side.
 * ============================================================
 */

export type SolanaWalletId = "phantom" | "solflare";

export interface SolanaWalletMeta {
  id: SolanaWalletId;
  name: string;
  /** Detection key on window (checked in order). */
  injection: string[];
  /** Official brand SVG string from @web3icons/core. */
  icon: string;
  installUrl: string;
  note: string;
}

export const SOL_WALLETS: SolanaWalletMeta[] = [
  {
    id: "phantom",
    name: "Phantom",
    injection: ["phantom", "solana"],
    icon: phantomIcon,
    installUrl: "https://phantom.app/download",
    note: "Connects read-only via the Phantom browser provider.",
  },
  {
    id: "solflare",
    name: "Solflare",
    injection: ["solflare", "solana"],
    icon: solflareIcon,
    installUrl: "https://solflare.com/download",
    note: "Connects read-only via the Solflare browser provider.",
  },
];

export function getSolWallet(id: string): SolanaWalletMeta | null {
  return SOL_WALLETS.find((w) => w.id === id) ?? null;
}

/** Minimal provider surface RECODE touches (never signs, never sends). */
export interface SolanaProviderLike {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

/** Resolve the provider for a wallet id (manual-only, explicit). */
export function resolveSolanaProvider(walletId: SolanaWalletId): SolanaProviderLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  if (walletId === "phantom") {
    const phantom = w.phantom as Record<string, unknown> | undefined;
    const p = (phantom?.solana ?? w.solana) as SolanaProviderLike | undefined;
    return p && (p.isPhantom || p.isSolflare !== true) ? (p as SolanaProviderLike) : null;
  }
  if (walletId === "solflare") {
    const sf = w.solflare as SolanaProviderLike | undefined;
    if (sf) return sf;
    const fallback = w.solana as SolanaProviderLike | undefined;
    return fallback?.isSolflare ? fallback : null;
  }
  return null;
}

/** Which Solana wallets are installed (by probe, no API calls). */
export function installedSolanaWallets(): SolanaWalletId[] {
  if (typeof window === "undefined") return [];
  const w = window as unknown as Record<string, unknown>;
  const out: SolanaWalletId[] = [];
  const phantom = w.phantom as Record<string, unknown> | undefined;
  const solana = w.solana as SolanaProviderLike | undefined;
  if (phantom?.solana || solana?.isPhantom) out.push("phantom");
  if (w.solflare || solana?.isSolflare) out.push("solflare");
  return out;
}