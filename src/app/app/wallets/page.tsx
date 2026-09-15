"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WhaleFeed } from "@/components/whales/WhaleFeed";
import { Panel } from "@/components/ui/primitives";
import { fmtUsd, shortHash, timeAgo } from "@/lib/format";
import { addressFamily } from "@/lib/types";

export default function WalletsPage() {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const router = useRouter();

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    // Address-family routing: EVM addresses are normalized to lowercase,
    // base58 Solana addresses keep their exact case (case-sensitive).
    const family = addressFamily(v);
    if (!family) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    // Routes live under /app — /wallet/<addr> (without the prefix) has no page
    // and previously landed on the not-found surface.
    router.push(`/app/wallet/${family === "evm" ? v.toLowerCase() : v}`);
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Wallet Intelligence</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Inspect any public wallet on Robinhood Chain — no wallet connection required. Live
          on-chain balances across every verified tokenized asset, transfer history and account
          age, all read directly from the chain.
        </p>
      </header>

      <Panel>
        <form onSubmit={go} className="flex gap-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (invalid) setInvalid(false);
            }}
            placeholder="0x… EVM or base58 Solana public address"
            spellCheck={false}
            aria-invalid={invalid}
            aria-label="Wallet address"
            className={`tnum h-10 w-full rounded-[4px] border bg-panel-2 px-3.5 text-[13px] outline-none placeholder:text-faint focus:border-green/40 ${
              invalid ? "border-neg" : "border-line"
            }`}
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-[4px] btn-accent px-5 text-[12.5px] font-semibold text-green"
          >
            Analyze
          </button>
        </form>
        {invalid ? <p className="mt-2 text-[11.5px] text-neg">Invalid wallet address</p> : null}
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

