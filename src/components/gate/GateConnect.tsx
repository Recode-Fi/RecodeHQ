"use client";

import { useState } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { getWallet } from "@/lib/wallets";
import { getSolWallet } from "@/lib/solanaWallets";
import type { GateNetwork, GateStatus } from "@/lib/gate";
import { NetworkIcon } from "@/components/ui/NetworkIcon";
import { shortAddr } from "@/lib/format";

export function GateConnectStep({
  status,
  gateNetwork,
  activeName,
}: {
  status: GateStatus;
  gateNetwork: GateNetwork | null;
  activeName: string;
}) {
  if (status.kind === "mismatch") {
    return (
      <div className="rounded-[6px] border border-warn/50 bg-warn/10 px-4 py-3 text-[12.5px] text-warn">
        {status.message}
        <div className="mt-1 text-[11px] text-muted">
          The network is never switched automatically — choose the matching network above or connect
          the compatible wallet.
        </div>
      </div>
    );
  }
  if (status.kind === "wrong-network") {
    return <WrongNetworkCard status={status} />;
  }
  if (gateNetwork == null) {
    return (
      <div className="rounded-[6px] border border-dashed border-line px-4 py-3 text-[12.5px] text-muted">
        Select a network first.
      </div>
    );
  }
  if (status.kind === "ready") {
    return <ReadyCard gateNetwork={gateNetwork} activeName={activeName} />;
  }
  if (status.kind !== "connect") return null;
  return status.family === "solana" ? <SolanaConnect /> : <EvmConnect />;
}

function WrongNetworkCard({ status }: { status: Extract<GateStatus, { kind: "wrong-network" }> }) {
  const evm = useWallet();
  const [switching, setSwitching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-[6px] border border-warn/50 bg-warn/10 px-4 py-3.5">
      <div className="text-[12.5px] font-semibold text-warn">Wrong network</div>
      <p className="mt-1 text-[12px] text-muted">
        Your wallet is connected to a different EVM network than the selected one. Approve the
        network switch in your wallet to continue (the request is made only when you click below).
      </p>
      <button
        type="button"
        onClick={async () => {
          setSwitching(true);
          setErr(null);
          const ok = await evm.ensureChain(status.targetHex);
          setSwitching(false);
          if (!ok) setErr("Network switch rejected or unavailable. Add the network in your wallet's settings and try again.");
        }}
        disabled={switching}
        className="mt-3 w-full rounded-[6px] border border-green/40 bg-green-soft px-4 py-2.5 text-[12.5px] font-semibold text-green transition-colors hover:border-green/70 disabled:opacity-60"
      >
        {switching ? "Waiting for wallet approval…" : `SWITCH TO ${status.targetName.toUpperCase()}`}
      </button>
      {err ? <div className="mt-2 text-[11.5px] text-neg">{err}</div> : null}
      <p className="mt-2 text-[11px] text-faint">
        Access is verified against the resulting chain ID after the switch — never granted
        automatically.
      </p>
    </div>
  );
}

function ReadyCard({
  gateNetwork,
  activeName,
}: {
  gateNetwork: GateNetwork;
  activeName: string;
}) {
  const evm = useWallet();
  const sol = useSolanaWallet();
  const address = (evm.address ?? sol.address)!;
  const walletName =
    evm.address && evm.connectedWallet
      ? (getWallet(evm.connectedWallet)?.name ?? "EVM Wallet")
      : sol.address && sol.connectedWallet
        ? (getSolWallet(sol.connectedWallet)?.name ?? "Solana Wallet")
        : "Wallet";
  return (
    <div className="rounded-[6px] border border-green/40 bg-green-soft px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <NetworkIcon id={gateNetwork} size={26} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
              {activeName} · {walletName}
            </div>
            <div className="font-mono text-[13px] text-text">{shortAddr(address)}</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-pos/40 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-pos">
          ✓ Wallet Connected
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          if (sol.address) sol.disconnect();
          if (evm.address) evm.disconnect();
        }}
        className="mt-2 text-[11px] text-muted underline-offset-2 hover:text-text hover:underline"
      >
        Use a different wallet
      </button>
    </div>
  );
}

function SolanaConnect() {
  const sol = useSolanaWallet();
  return (
    <div className="space-y-2">
      {(["phantom", "solflare"] as const).map((id) => {
        const meta = getSolWallet(id);
        const installed = sol.installed.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => void sol.connect(id)}
            disabled={sol.connectingWallet != null}
            className="flex w-full items-center justify-between rounded-[6px] border border-line bg-surface px-4 py-3 text-[12.5px] text-text transition-colors hover:border-green/50 disabled:opacity-60"
          >
            <span className="font-medium">{meta?.name ?? id}</span>
            <span className={`text-[11px] ${installed ? "text-pos" : "text-faint"}`}>
              {sol.connectingWallet === id ? "Connecting…" : installed ? "Detected" : "Not detected"}
            </span>
          </button>
        );
      })}
      <p className="text-[11px] text-faint">
        No compatible wallet detected for this network? Install Phantom or Solflare, then try again.
      </p>
    </div>
  );
}

function EvmConnect() {
  const evm = useWallet();
  const anyWallet = evm.legacyInjected || evm.installedRdns.length > 0;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={evm.openWalletModal}
        disabled={evm.connectingWallet != null}
        className="flex w-full items-center justify-between rounded-[6px] border border-green/40 bg-green-soft px-4 py-3 text-[12.5px] font-semibold text-green transition-colors hover:border-green/70 disabled:opacity-60"
      >
        <span>Connect EVM Wallet</span>
        <span className="text-[11px] font-normal text-muted">
          MetaMask · Rabby · Coinbase · Trust · Rainbow
        </span>
      </button>
      {!anyWallet ? (
        <p className="text-[11px] text-faint">
          No compatible wallet detected for this network. Install an EVM wallet extension, then try
          again.
        </p>
      ) : null}
      <p className="text-[11px] text-faint">
        The same 0x address can exist on several EVM networks — the selected network above is the
        authoritative context.
      </p>
    </div>
  );
}