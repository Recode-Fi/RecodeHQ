// Official brand SVGs (raw strings) from @web3icons/core - subpath default
// exports, typed as strings via the package's .svg.d.ts declarations.
import metamaskIcon from "@web3icons/core/svgs/wallets/branded/metamask.svg";
import rabbyIcon from "@web3icons/core/svgs/wallets/branded/rabby.svg";
import coinbaseIcon from "@web3icons/core/svgs/wallets/branded/coinbase.svg";
import trustIcon from "@web3icons/core/svgs/wallets/branded/trust.svg";
import rainbowIcon from "@web3icons/core/svgs/wallets/branded/rainbow.svg";

/**
 * ============================================================
 * WALLET REGISTRY — five supported wallets with official icons.
 * Icons are official brand SVGs from @web3icons/core (raw SVG
 * strings, brand colors intact). No fake or hand-drawn logos.
 * ============================================================
 */

export type WalletId = "metamask" | "rabby" | "coinbase" | "trust" | "rainbow";

export interface WalletMeta {
  id: WalletId;
  name: string;
  /** EIP-6963 rdns — authoritative injected-provider identification. */
  rdns: string;
  /** Official brand SVG string from @web3icons/core. */
  icon: string;
  installUrl: string;
  /** Official mobile deep link (opens the wallet's dApp browser). null = none. */
  deepLink: ((url: string) => string) | null;
  mobileNote: string;
}

export const WALLETS: WalletMeta[] = [
  {
    id: "metamask",
    name: "MetaMask",
    rdns: "io.metamask",
    icon: metamaskIcon,
    installUrl: "https://metamask.io/download/",
    deepLink: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`,
    mobileNote: "Opens the MetaMask app browser at RECODE.",
  },
  {
    id: "rabby",
    name: "Rabby Wallet",
    rdns: "io.rabby",
    icon: rabbyIcon,
    installUrl: "https://rabby.io/",
    deepLink: null,
    mobileNote: "Rabby mobile connects via its in-app browser or WalletConnect.",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    rdns: "com.coinbase.wallet",
    icon: coinbaseIcon,
    installUrl: "https://www.coinbase.com/wallet/downloads",
    deepLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    mobileNote: "Opens Coinbase Wallet at RECODE.",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    rdns: "com.trustwallet.app",
    icon: trustIcon,
    installUrl: "https://trustwallet.com/download",
    deepLink: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
    mobileNote: "Opens the Trust Wallet app browser at RECODE.",
  },
  {
    id: "rainbow",
    name: "Rainbow Wallet",
    rdns: "me.rainbow",
    icon: rainbowIcon,
    installUrl: "https://rainbow.me/",
    deepLink: (url) => `https://r.rainbow.me/open-url?url=${encodeURIComponent(url)}`,
    mobileNote: "Opens the Rainbow app browser at RECODE.",
  },
];

export function getWallet(id: string): WalletMeta | null {
  return WALLETS.find((w) => w.id === id) ?? null;
}
