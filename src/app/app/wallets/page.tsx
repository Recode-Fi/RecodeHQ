"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChain } from "@/providers/chain-provider";
import { routeWalletLookup } from "@/lib/walletRouting";
import { Panel } from "@/components/ui/primitives";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";

/**
 * Wallet Intelligence search — the global network selector governs
 * which wallet pipeline a lookup may use. An address whose family
 * does not match the selected network gets a clean state, never
 * another chain's wallet data.
 */
export function WalletsSearch() {
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  const { selected, selectedLabel } = useChain();

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const decision = routeWalletLookup(value.trim(), selected);
    if (decision.kind === "invalid") {
      setNote("Invalid wallet address — enter an EVM (0x…) or Solana (base58) address.");
      return;
    }
    if (decision.kind === "mismatch") {
      setNote(decision.message);
      return;
    }
    setNote(null);
    router.push(`/app/wallet/${decision.address}`);
  };

  const networkHint =
    selected === "solana"
      ? "Solana (base58) addresses — SOL, SPL tokens and wallet activity via the Solana pipeline."
      : selected === "arc"
        ? "Arc (0x…) addresses — native USDC, ERC-20 holdings and USDC activity via the Arc pipeline."
        : `${selectedLabel} (0x…) addresses — live on-chain balances, transfer history and account age.`;

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Wallet Intelligence</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Inspect any public wallet on the selected network ({selectedLabel}) — no wallet
          connection required. {networkHint}
        </p>
      </header>

      <Panel>
        <form onSubmit={go} className="flex gap-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (note) setNote(null);
            }}
            placeholder="Wallet public address (0x… EVM or base58 Solana)"
            spellCheck={false}
            aria-label="Wallet address"
            className={`tnum h-10 w-full rounded-[4px] border bg-panel-2 px-3.5 text-[13px] outline-none placeholder:text-faint focus:border-green/40 ${
              note ? "border-neg" : "border-line"
            }`}
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-[4px] btn-accent px-5 text-[12.5px] font-semibold text-green"
          >
            Analyze
          </button>
        </form>
        {note ? <p className="mt-2 text-[11.5px] text-neg">{note}</p> : null}
        <p className="mt-2 text-[10.5px] text-faint">
          ENS resolution and wallet labels require a naming provider — not yet configured.
        </p>
      </Panel>

      <h2 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Recently active large wallets
      </h2>
      <RecentWallets />
    </div>
  );
}

export default function WalletsPage() {
  return <WalletsSearch />;
}

function RecentWallets() {
  // lightweight inline poll (client-only page)
  const rows = useRecentWhaleWallets();
  if (rows.length === 0) {
    return (
      <p className="rounded-[6px] border border-dashed border-line px-6 py-10 text-center text-[12.5px] text-faint">
        Awaiting verified whale flows…
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-[6px] border border-line bg-panel">
      {rows.map((w) => (
        <li key={w.wallet} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
          <Link href={`/app/wallet/${w.wallet}`} className="tnum flex-1 text-green hover:underline">
            {shortHash(w.wallet)}
          </Link>
          <span className="text-muted">{w.symbol}</span>
          <span className="tnum w-24 text-right font-medium">{fmtUsd(w.usd)}</span>
          <span className="tnum w-20 text-right text-faint">{timeAgo(w.ts)}</span>
        </li>
      ))}
    </ul>
  );
}

function useRecentWhaleWallets() {
  const [rows, setRows] = useState<{ wallet: string; symbol: string | null; usd: number | null; ts: number }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { recodeService } = await import("@/services/recodeService");
      const res = await recodeService.whales();
      const seen = new Set<string>();
      const out: typeof rows = [];
      for (const w of res.data ?? []) {
        if (!w.wallet || seen.has(w.wallet)) continue;
        seen.add(w.wallet);
        out.push({ wallet: w.wallet, symbol: w.symbol, usd: w.usd, ts: w.ts });
        if (out.length >= 12) break;
      }
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}

