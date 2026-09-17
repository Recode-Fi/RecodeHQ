"use client";

import Link from "next/link";
import { RecodeMark } from "@/components/brand/Logo";
import { OFFICIAL_LINKS } from "@/lib/official";

/** RECODE Documentation — documents only functionality that exists. */

const TOC: { id: string; label: string }[] = [
  { id: "introduction", label: "Introduction" },
  { id: "getting-started", label: "Getting Started" },
  { id: "terminal", label: "Terminal Overview" },
  { id: "networks", label: "Supported Networks" },
  { id: "wallet", label: "Wallet Connection" },
  { id: "market", label: "Market Intelligence" },
  { id: "token", label: "Token Intelligence" },
  { id: "wallet-intel", label: "Wallet Intelligence" },
  { id: "whales", label: "Whale Intelligence" },
  { id: "smart-money", label: "Smart Money" },
  { id: "radar", label: "Radar" },
  { id: "ai", label: "AI" },
  { id: "architecture", label: "Multi-Chain Architecture" },
  { id: "providers", label: "Live Data & Providers" },
  { id: "integrity", label: "Data Integrity" },
  { id: "faq", label: "FAQ" },
  { id: "community", label: "GitHub & Community" },
];

export default function DocsPage() {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <RecodeMark size={20} />
            <span className="text-[14px] font-extrabold tracking-[0.2em]">RECODE</span>
          </Link>
          <div className="flex items-center gap-4 text-[12.5px]">
            <a href={OFFICIAL_LINKS.githubOrg} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text">GitHub ↗</a>
            <a href={OFFICIAL_LINKS.x} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text">X ↗</a>
            <Link href="/app" className="rounded-[4px] btn-accent px-3.5 py-1.5 font-semibold text-green">Open Terminal</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-[-0.01em]">RECODE Documentation</h1>
        <p className="mt-2 text-[14px] text-muted">Understand the terminal. Explore the intelligence layer.</p>
        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav className="top-20 hidden self-start lg:sticky lg:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Contents</div>
            <ul className="mt-3 space-y-1.5">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-[12.5px] text-muted transition-colors hover:text-text">{t.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="max-w-3xl space-y-10">
            <Section id="introduction" title="Introduction">
              <P>RECODE is a multi-chain on-chain intelligence terminal: market, scanner, token, wallet, whale, smart-money, radar and AI intelligence across six live networks, built on a strict live-data integrity contract — verified values or explicit &quot;Data unavailable&quot; states, never fabricated numbers.</P>
            </Section>
            <Section id="getting-started" title="Getting Started">
              <P>Entry follows one flow:</P>
              <pre className="overflow-x-auto rounded-[6px] border border-line bg-panel px-4 py-3 text-[12px] text-text">{`SELECT NETWORK → CONNECT COMPATIBLE WALLET → VERIFY CONNECTION → ENTER RECODE TERMINAL`}</pre>
              <P>Wallet connection is <strong>explicit</strong> — RECODE never connects a wallet automatically on page load and never opens a wallet popup by itself. Selecting a network alone does not connect a wallet. Connection is read/access authorization only: no transaction, no token approval, no signature is requested during access. The same 0x address can exist on several EVM networks — the selected network is the authoritative context, never inferred from the address.</P>
            </Section>
            <Section id="terminal" title="Terminal Overview">
              <P>The terminal is organized into Overview (Markets, Discover, Radar), Scan &amp; Intelligence (Scan, Asset Intelligence, Wallet Intelligence, Smart Money, Whale Activity), Signals &amp; Forecast, Portfolio (Portfolio, Watchlist, Alerts) and Tools (Transaction Explorer). A global network selector governs every surface, and a floating RECODE AI agent answers questions with chain-aware tool access.</P>
            </Section>
            <Section id="networks" title="Supported Networks">
              <P>Networks live in one registry (<code>src/chains/registry.ts</code>) — the single source of truth:</P>
              <NetworkTable />
            </Section>
            <Section id="wallet" title="Wallet Connection">
              <P>Wallets connect read-only (public address only — RECODE never signs, sends or requests approvals as part of access): Solana family: Phantom, Solflare. EVM family: MetaMask, Rabby, Coinbase Wallet, Trust Wallet, Rainbow, plus any EIP-6963 compatible injected provider.</P>
              <P>A Solana wallet satisfies Solana; an EVM wallet satisfies all EVM networks. On EVM, the wallet&apos;s current chain id must match the selected network — a wrong network shows an explicit, user-approved &quot;Switch to [network]&quot; action. A family mismatch is rejected with a clear message; networks are never switched silently. Disconnecting revokes terminal access.</P>
            </Section>
            <Section id="market" title="Market Intelligence">
              <P>Per-network market tables (Discover, Markets) with live price, 24h change, market cap/FDV, liquidity, 24h volume, buy/sell activity, DEX and pair information, plus search, sorting and direct contract/mint lookup that resolves by address — not by membership in a tracked list.</P>
            </Section>
            <Section id="token" title="Token Intelligence">
              <P>Per-token pages with live market data, holder concentration where providers support it, whale events and metadata (name, symbol, decimals, logo). Paste a contract address or mint into the Scanner to resolve any token directly, regardless of whether the background engine has indexed it.</P>
            </Section>
            <Section id="wallet-intel" title="Wallet Intelligence">
              <P>Live balances (native + tokens), verified pricing where available, portfolio value (priced holdings only), token metadata, transaction/activity history with classification (sent, received, swaps where identifiable) and explorer links. Unpriced holdings stay visible with an explicit unavailable state — never hidden, never zeroed.</P>
            </Section>
            <Section id="whales" title="Whale Intelligence">
              <P>Large transfers derived from real on-chain evidence — stablecoin Transfer logs on the EVM NET chains, balance deltas of largest token accounts on Solana, native-USDC system-emitter flows on Arc. Every event carries its transaction hash, block and derivation basis. Accumulation/distribution is classified only where the data supports it.</P>
            </Section>
            <Section id="smart-money" title="Smart Money">
              <P>Wallets ranked by verified net stablecoin/flow per chain (inflows + mints − outflows − burns), computed independently on each network from that network&apos;s own events. Transfers are direction-neutral. ROI/win-rate are shown only where reliably calculable — otherwise explicitly &quot;insufficient data&quot;. Scores are never copied across chains.</P>
            </Section>
            <Section id="radar" title="Radar">
              <P>Rule-based signals over verified stored data: unusual volume, liquidity changes, significant price movement, new pairs, large transfers and whale activity. Every signal displays its derivation basis; nothing is fabricated.</P>
            </Section>
            <Section id="ai" title="AI">
              <P>The RECODE Agent answers with chain-aware tool access — Solana mints are never processed as EVM contracts and vice versa, and the selected network determines which pipeline it queries. It cites only tool results; when data is unavailable it says so instead of inventing numbers.</P>
            </Section>
            <Section id="architecture" title="Multi-Chain Architecture">
              <P><strong>The selected network is the source of truth.</strong> Solana selected → Solana data only. Arc selected → Arc data only. Robinhood Chain, Ethereum, BSC and Arbitrum each route to their own pipeline. There is no cross-chain fallback, no silent reuse of another network&apos;s data, and no stale rows after switching — every surface re-renders from its own chain&apos;s endpoints.</P>
              <P>Each network runs an isolated intelligence layer (own RPC, own store, own provider filter): <code>src/server/sync/</code> (Robinhood), <code>src/server/solana/</code>, <code>src/server/arc/</code> and the chain-generic <code>src/server/evmnet/</code> (Ethereum/BSC/Arbitrum).</P>
            </Section>
            <Section id="providers" title="Live Data &amp; Providers">
              <P>RECODE uses live blockchain and market data from: DexScreener (keyless DEX market data), chain-native JSON-RPC endpoints, Blockscout (Robinhood Chain explorer), the Robinhood Stock Token API, Yahoo Finance (underlying asset reference data), CoinGecko (RWA aggregates) and Gemini (AI agent). All optional credentials live in server-side environment variables — never in client code. Dedicated RPC URLs per network are optional throughput upgrades; public endpoints work by default.</P>
            </Section>
            <Section id="integrity" title="Data Integrity">
              <P>RECODE never fabricates prices, market caps, volumes, liquidity, holder counts, balances, whale events, smart-money scores or PnL. Missing data renders as &quot;—&quot; / &quot;Data unavailable&quot; — never as 0. Where provider or indexing limits exist (e.g. history depth windows), the limitation is stated in the interface rather than hidden.</P>
            </Section>
            <Section id="faq" title="FAQ">
              <P><strong>Does RECODE request transactions or signatures to enter?</strong> No. Access is read-only wallet authorization only.</P>
              <P><strong>Why does the market data show &quot;—&quot;?</strong> The provider does not currently return a verified value for that field. RECODE displays unavailable rather than an estimate or zero.</P>
              <P><strong>Why must I switch networks in my wallet?</strong> The selected RECODE network and your wallet&apos;s active chain must match for EVM verification. The switch always requires your explicit approval.</P>
              <P><strong>Does RECODE store my keys?</strong> No. Wallets connect read-only; RECODE never requests or stores private keys, seed phrases or signatures.</P>
            </Section>
            <Section id="community" title="GitHub &amp; Community">
              <P>Official website: <a href={OFFICIAL_LINKS.website} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">{OFFICIAL_LINKS.website}</a></P>
              <P>Official GitHub: <a href={OFFICIAL_LINKS.githubOrg} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">{OFFICIAL_LINKS.githubOrg}</a> (repository: <a href={OFFICIAL_LINKS.githubRepo} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">RecodeHQ</a>)</P>
              <P>Official X: <a href={OFFICIAL_LINKS.x} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">{OFFICIAL_LINKS.x}</a></P>
              <P>Documentation: <a href={OFFICIAL_LINKS.docs} target="_blank" rel="noopener noreferrer" className="text-green hover:underline">{OFFICIAL_LINKS.docs}</a></P>
            </Section>
            <footer className="border-t border-line bg-surface/60">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-6 text-[11px] text-faint">
                <span>© {new Date().getFullYear()} RECODE · Decode what moves markets.</span>
                <span className="flex gap-4">
                  <a href={OFFICIAL_LINKS.githubOrg} target="_blank" rel="noopener noreferrer" className="hover:text-text">GitHub</a>
                  <a href={OFFICIAL_LINKS.x} target="_blank" rel="noopener noreferrer" className="hover:text-text">X</a>
                  <a href={OFFICIAL_LINKS.website} target="_blank" rel="noopener noreferrer" className="hover:text-text">recode-fi.xyz</a>
                </span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="border-b border-line-soft pb-2 text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted">{children}</p>;
}

function NetworkTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="py-2 pr-4 font-medium">Network</th>
            <th className="py-2 pr-4 font-medium">Family</th>
            <th className="py-2 pr-4 font-medium">Chain ID</th>
            <th className="py-2 font-medium">Explorer</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Solana", "non-EVM", "mainnet-beta", "solscan.io"],
            ["Ethereum", "EVM", "1", "etherscan.io"],
            ["BNB Smart Chain", "EVM", "56", "bscscan.com"],
            ["Arbitrum One", "EVM", "42161", "arbiscan.io"],
            ["Arc (Circle)", "EVM", "5042", "explorer.arc.io"],
            ["Robinhood Chain", "EVM", "4663", "robinhoodchain.blockscout.com"],
          ].map(([n, f, cid, e]) => (
            <tr key={n} className="border-t border-line/60">
              <td className="py-2 pr-4">{n}</td>
              <td className="py-2 pr-4">{f}</td>
              <td className="py-2 pr-4 tnum">{cid}</td>
              <td className="py-2">{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}