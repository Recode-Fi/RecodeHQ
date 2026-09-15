import { getWallet, type WalletId } from "./wallets";

/**
 * ============================================================
 * WALLET CORE - EIP-1193 + EIP-6963 helpers (framework-free).
 *
 * STRICT NO-AUTO-CONNECT: every function here that talks to a
 * wallet API is only invoked from explicit user actions
 * (modal wallet-row click / ensureChain on user request).
 * EIP-6963 discovery is passive and cannot trigger popups.
 * ============================================================
 */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/** EIP-6963 announced provider metadata. */
export interface ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface DiscoveredProvider {
  info: ProviderInfo;
  provider: Eip1193Provider;
}

export const ROBINHOOD_CHAIN_HEX = "0x1237";
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_NAME = "Robinhood Chain";

export function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

/** Passive injected-object detection - never requests anything. */
export function legacyEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as { ethereum?: Eip1193Provider }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

/** Resolve a wallet's provider: EIP-6963 rdns match, then legacy flags. */
export function resolveWalletProvider(
  walletId: WalletId,
  discovered: DiscoveredProvider[],
): { provider: Eip1193Provider; rdns: string } | null {
  const meta = getWallet(walletId);
  if (!meta) return null;
  const match = discovered.find((p) => p.info.rdns === meta.rdns);
  if (match) return { provider: match.provider, rdns: meta.rdns };
  const legacy = legacyEthereum();
  if (legacy) {
    const asAny = legacy as unknown as {
      isMetaMask?: boolean;
      providers?: {
        isMetaMask?: boolean;
        isRabby?: boolean;
        isCoinbaseWallet?: boolean;
        isTrust?: boolean;
        isTrustWallet?: boolean;
      }[];
    };
    const inner = asAny.providers?.find(
      (p) =>
        (walletId === "metamask" && p.isMetaMask) ||
        (walletId === "rabby" && p.isRabby) ||
        (walletId === "coinbase" && p.isCoinbaseWallet) ||
        (walletId === "trust" && (p.isTrust || p.isTrustWallet)),
    );
    if (inner) return { provider: inner as Eip1193Provider, rdns: meta.rdns };
    // Generic injected fallback only for MetaMask, and only when no
    // EIP-6963 wallet announced itself (single-extension browsers).
    if (walletId === "metamask" && (asAny.isMetaMask || discovered.length === 0)) {
      return { provider: legacy, rdns: meta.rdns };
    }
  }
  return null;
}

export interface ConnectOutcome {
  address: string;
  chainIdHex: string | null;
  wallet: WalletId;
}

/**
 * Explicit user action ONLY (wallet row click in the Connect modal).
 * Mobile: opens the wallet's official deep link when no injected
 * provider exists. Never fakes a connection.
 */
export async function connectWalletById(
  walletId: WalletId,
  discovered: DiscoveredProvider[],
): Promise<ConnectOutcome | { deepLink: string } | { error: string }> {
  const meta = getWallet(walletId);
  if (!meta) return { error: "Unknown wallet." };
  const resolved = resolveWalletProvider(walletId, discovered);

  if (!resolved && isMobile() && meta.deepLink) {
    return { deepLink: meta.deepLink(window.location.href.split("#")[0]) };
  }
  if (!resolved) {
    return {
      error: `${meta.name} is not installed. Install it from ${meta.installUrl.replace(/^https?:\/\//, "")}.`,
    };
  }
  try {
    const accounts = (await resolved.provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts || accounts.length === 0) throw new Error("No accounts authorized");
    let chainIdHex: string | null = null;
    try {
      chainIdHex = (await resolved.provider.request({ method: "eth_chainId" })) as string;
    } catch {
      /* optional read - never blocks connection */
    }
    return { address: accounts[0].toLowerCase(), chainIdHex, wallet: walletId };
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4001) return { error: "Connection request rejected." };
    if (err instanceof Error && /No accounts/.test(err.message))
      return { error: "No accounts were authorized. Please try again." };
    return { error: "Unable to connect wallet. Please try again." };
  }
}

/**
 * Explicit user action ONLY. Requests a network switch; on 4902
 * (chain not added) returns a friendly, actionable message instead
 * of injecting a guessed RPC.
 */
export async function ensureChainOn(
  provider: Eip1193Provider,
  targetHex: string,
  currentHex: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (currentHex === targetHex) return { ok: true };
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4902) {
      return {
        ok: false,
        error: `Robinhood Chain (${parseInt(targetHex, 16)}) is not added to your wallet. Add it from your wallet's network settings to use wallet features.`,
      };
    }
    if (code === 4001) return { ok: false, error: "Network switch rejected." };
    return { ok: false, error: "Unable to switch network. Please try again." };
  }
}
