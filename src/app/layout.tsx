import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-recode-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-recode-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RECODE — Decode What Moves Markets",
    template: "%s · RECODE",
  },
  description:
    "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
  keywords: [
    "RECODE",
    "RWA intelligence",
    "tokenized assets",
    "on-chain markets",
    "tokenized stocks",
    "market intelligence",
  ],
  openGraph: {
    title: "RECODE — Decode What Moves Markets",
    description:
      "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
    siteName: "RECODE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RECODE — Decode What Moves Markets",
    description:
      "RECODE is an intelligence platform for tokenized assets, RWA markets and on-chain activity.",
  },
};

import { ChainProvider } from "@/providers/chain-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import { SolanaWalletProvider } from "@/providers/solana-wallet-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { InitSequence } from "@/components/boot/InitSequence";
import { AgentProvider } from "@/components/agent/AgentContext";
import { AgentFloating } from "@/components/agent/AgentFloating";
import { cookies } from "next/headers";

export const THEME_COOKIE = "recode.theme";

/**
 * Theme is SSR-rendered from the persistence cookie so the server and the
 * client hydrate the exact same <html data-theme> state. DARK is the
 * default: no cookie or an unrecognized value renders dark, so every new
 * user's first visible frame is already dark (no white flash). Only an
 * explicitly saved "light" preference renders light. The ThemeProvider
 * keeps this attribute in sync and mirrors the choice to the cookie on
 * every change, so there is no pre-hydration DOM mutation and no flash of
 * the wrong theme by construction.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider>
          {/* Solana wallet context wraps the EVM provider so the shared
              Connect Wallet modal (rendered by WalletProvider) can use it. */}
          <SolanaWalletProvider>
            <WalletProvider>
              <ChainProvider>
                <AgentProvider>
                  <InitSequence />
                  {children}
                  {/* RECODE Agent — one global floating launcher + panel. */}
                  <AgentFloating />
                </AgentProvider>
              </ChainProvider>
            </WalletProvider>
          </SolanaWalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
